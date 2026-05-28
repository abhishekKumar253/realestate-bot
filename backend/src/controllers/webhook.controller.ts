import type { Request, Response } from "express";
import { MessageRole, ConversationState, LeadStatus } from "@prisma/client";
import * as Sentry from "@sentry/node";
import {
  extractMessage,
  extractContactName,
  extractPhoneNumberId,
  normalizePhone,
  detectLanguage,
} from "../utils/helpers";
import {
  getOrCreateLead,
  updateLead,
  updateConversationState,
  saveMessage,
  getConversationHistory,
  updateLeadStatus,
  createNewConversation,
} from "../services/lead.service";
import {
  extractLeadData,
  generateReply,
  type ExtractedLeadData,
} from "../services/openai.service";
import {
  sendTextMessage,
  markAsRead,
  sendTypingIndicator,
  sendLeadNotification,
} from "../services/whatsapp.service";
import {
  getBuilderByPhoneNumberId,
  type BuilderWithToken,
} from "../services/builder.service";
import logger from "../utils/logger";
import type {
  WhatsAppWebhookPayload,
  IncomingMessage,
} from "../types/whatsapp.types";
import { prisma } from "../db/prisma";

// ─── Constants ────────────────────────────────────────────────────────────────
import {
  REQUIRED_LEAD_FIELDS,
  SITE_VISIT_AFFIRMATIVE_PATTERNS,
  OPT_OUT_PHRASES,
} from "../constants/conversation.constants";

// ========== GET — Meta Webhook Verification ==========
export const handleVerification = async (
  req: Request,
  res: Response
): Promise<void> => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe" || !token) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const builder = await prisma.builder.findFirst({
    where: { verifyToken: token, isActive: true },
  });

  if (!builder) {
    logger.warn({ token }, "❌ Webhook verification failed — no builder found");
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  logger.info({ builderId: builder.id }, "✅ Webhook verified");
  res.status(200).send(challenge);
};

// ========== Helpers ==========
const getUserText = (msg: IncomingMessage): string => {
  if (msg.type === "text") return msg.text?.body ?? "";
  if (msg.type === "interactive")
    return msg.interactive?.button_reply?.title ?? "";
  return "";
};

const buildUpdateData = (
  extracted: ExtractedLeadData
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  if (extracted.name) data.name = extracted.name;
  if (extracted.propertyType) data.propertyType = extracted.propertyType;
  if (extracted.budget) data.budget = extracted.budget;
  if (extracted.location) data.location = extracted.location;
  if (extracted.bhk) data.bhk = extracted.bhk;
  if (extracted.purpose) data.purpose = extracted.purpose;
  if (extracted.timeline) data.timeline = extracted.timeline;
  return data;
};

// ✅ Using constants file
const getMissingFields = (lead: Record<string, unknown>): string[] => {
  return REQUIRED_LEAD_FIELDS.filter((f) => !lead[f]);
};

const fieldToState: Record<string, ConversationState> = {
  propertyType: ConversationState.ASK_PROPERTY_TYPE,
  budget: ConversationState.ASK_BUDGET,
  location: ConversationState.ASK_LOCATION,
  bhk: ConversationState.ASK_BHK,
  purpose: ConversationState.ASK_PURPOSE,
  timeline: ConversationState.ASK_TIMELINE,
  name: ConversationState.ASK_NAME,
};

const computeNewState = (
  currentState: ConversationState,
  missingFields: string[],
  wantsVisit: boolean
): ConversationState => {
  if (currentState === ConversationState.COMPLETED) {
    return ConversationState.COMPLETED;
  }

  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    return firstMissing && fieldToState[firstMissing]
      ? fieldToState[firstMissing]
      : currentState;
  }

  if (currentState === ConversationState.ASK_SITE_VISIT && wantsVisit) {
    return ConversationState.COMPLETED;
  }

  return ConversationState.ASK_SITE_VISIT;
};

// ========== Core Message Processing ==========
async function processIncomingMessage(
  phone: string,
  userText: string,
  whatsappMessageId: string,
  lead: Awaited<ReturnType<typeof getOrCreateLead>>,
  conversation: NonNullable<
    Awaited<ReturnType<typeof getOrCreateLead>>["conversations"][0]
  >,
  builder: BuilderWithToken
): Promise<void> {
  const history = await getConversationHistory(conversation.id);
  const historyForOpenAI = history.map((msg) => ({
    role:
      msg.role === MessageRole.USER
        ? ("user" as const)
        : ("assistant" as const),
    content: msg.content,
  }));

  const extracted = await extractLeadData(userText, historyForOpenAI);

  // ✅ Using constants for affirmative patterns
  if (conversation.state === ConversationState.ASK_SITE_VISIT) {
    const lowerMsg = userText.toLowerCase().trim();
    extracted.wantsVisit = SITE_VISIT_AFFIRMATIVE_PATTERNS.some((p) =>
      lowerMsg.includes(p)
    );
  } else {
    extracted.wantsVisit = false;
  }

  await saveMessage(
    conversation.id,
    MessageRole.USER,
    userText,
    whatsappMessageId
  );

  const updateData = buildUpdateData(extracted);
  const freshLead =
    Object.keys(updateData).length > 0
      ? await updateLead(lead.id, updateData)
      : lead;

  const mergedLead = {
    propertyType: freshLead.propertyType,
    budget: freshLead.budget,
    location: freshLead.location,
    bhk: freshLead.bhk,
    purpose: freshLead.purpose,
    timeline: freshLead.timeline,
    name: freshLead.name,
  };

  const missingFields = getMissingFields(mergedLead);
  const newState = computeNewState(
    conversation.state,
    missingFields,
    extracted.wantsVisit ?? false
  );

  const finalState = newState;

  if (
    finalState === ConversationState.COMPLETED &&
    missingFields.length === 0
  ) {
    await updateLeadStatus(lead.id, LeadStatus.SITE_VISIT_SCHEDULED);

    if (builder.notificationPhone) {
      await sendLeadNotification(
        builder.phoneNumberId,
        builder.accessToken,
        builder.notificationPhone,
        {
          name: mergedLead.name,
          phone: lead.phone,
          propertyType: mergedLead.propertyType,
          budget: mergedLead.budget,
          location: mergedLead.location,
          bhk: mergedLead.bhk,
          purpose: mergedLead.purpose,
          timeline: mergedLead.timeline,
        },
        builder.businessName
      ).catch((err) => logger.error({ err }, "❌ Broker notification failed"));
    } else {
      logger.warn(
        { builderId: builder.id },
        "⚠️ No notificationPhone set for builder"
      );
    }
  }

  await updateConversationState(conversation.id, finalState);

  await sendTypingIndicator(
    builder.phoneNumberId,
    builder.accessToken,
    phone,
    whatsappMessageId
  ).catch((err) => logger.warn({ err }, "⚠️ Typing indicator failed"));

  const userLanguage = detectLanguage(userText);

  const reply = await generateReply(
    missingFields,
    {
      name: mergedLead.name ?? undefined,
      propertyType: mergedLead.propertyType ?? undefined,
      budget: mergedLead.budget ?? undefined,
      location: mergedLead.location ?? undefined,
      bhk: mergedLead.bhk ?? undefined,
      purpose: mergedLead.purpose ?? undefined,
      timeline: mergedLead.timeline ?? undefined,
      wantsVisit: extracted.wantsVisit,
      visitNote: extracted.visitNote,
    },
    [...historyForOpenAI, { role: "user" as const, content: userText }],
    builder.systemPrompt,
    userLanguage
  );

  const isSent = await sendTextMessage(
    builder.phoneNumberId,
    builder.accessToken,
    phone,
    reply
  );
  if (isSent) {
    await saveMessage(conversation.id, MessageRole.BOT, reply);
  }

  logger.info(
    { phone, state: finalState, builderId: builder.id },
    "✅ Message processed"
  );
}

// ========== Refactored handleIncoming with reduced cognitive complexity ==========

async function fetchActiveBuilder(
  phoneNumberId: string
): Promise<BuilderWithToken | null> {
  const builder = await getBuilderByPhoneNumberId(phoneNumberId);
  if (!builder) {
    logger.error({ phoneNumberId }, "❌ No active builder found");
    return null;
  }
  if (!builder.isActive) {
    logger.warn({ builderId: builder.id }, "⚠️ Builder inactive — ignoring");
    return null;
  }
  return builder;
}

async function sendFallbackIfNeeded(
  message: IncomingMessage,
  builder: BuilderWithToken
): Promise<boolean> {
  if (message.type !== "text" && message.type !== "interactive") {
    await sendTextMessage(
      builder.phoneNumberId,
      builder.accessToken,
      normalizePhone(message.from),
      "Maaf kijiye, main abhi sirf text messages samajh sakta hoon. 🙏 Kripya apni property requirement type karke bhej dijiye. 🏠"
    );
    return true;
  }
  return false;
}

async function isDuplicate(whatsappMessageId: string): Promise<boolean> {
  const existing = await prisma.message.findUnique({
    where: { whatsappMessageId },
  });
  if (existing) {
    logger.info({ messageId: whatsappMessageId }, "⚠️ Duplicate — skipping");
    return true;
  }
  return false;
}

// ✅ Using constants for opt‑out phrases
async function handleOptOut(
  lead: Awaited<ReturnType<typeof getOrCreateLead>>,
  userText: string,
  builder: BuilderWithToken,
  phone: string
): Promise<boolean> {
  if (lead.status === LeadStatus.LOST) {
    logger.info({ phone }, "⚠️ Lead is LOST — ignoring message");
    return true;
  }

  const lowerText = userText.toLowerCase().trim();

  if (OPT_OUT_PHRASES.some((phrase) => lowerText.includes(phrase))) {
    await updateLeadStatus(lead.id, LeadStatus.LOST);
    await sendTextMessage(
      builder.phoneNumberId,
      builder.accessToken,
      phone,
      "Aapka number hamare system se hata diya gaya hai. Aapko ab koi message nahi milega. Dhanyavaad."
    ).catch((err) =>
      logger.warn({ err }, "Failed to send opt‑out confirmation")
    );
    return true;
  }

  return false;
}

async function getActiveConversation(
  lead: Awaited<ReturnType<typeof getOrCreateLead>>,
  phone: string
) {
  let conversation = lead.conversations[0];
  if (!conversation) {
    logger.error({ phone }, "❌ No conversation found");
    throw new Error("No conversation found");
  }

  if (conversation.state === ConversationState.COMPLETED) {
    logger.info({ phone }, "🔄 Conversation reset — new conversation starting");
    conversation = await createNewConversation(lead.id);
    await updateLeadStatus(lead.id, LeadStatus.NEW);
  }
  return conversation;
}

// ========== POST — Incoming Messages (main handler) ==========
export const handleIncoming = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as WhatsAppWebhookPayload;
    if (body.object !== "whatsapp_business_account") return;

    // 1. Identify builder
    const phoneNumberId = extractPhoneNumberId(body);
    if (!phoneNumberId) {
      logger.warn("No phone_number_id in webhook");
      return;
    }

    const builder = await fetchActiveBuilder(phoneNumberId);
    if (!builder) return;

    // 2. Extract message & handle non‑text
    const message = extractMessage(body);
    if (!message) return;
    if (await sendFallbackIfNeeded(message, builder)) return;

    // 3. Normalize phone & text
    const phone = normalizePhone(message.from);
    const userText = getUserText(message);
    if (!userText.trim()) return;

    // 4. Duplicate check
    if (await isDuplicate(message.id)) return;

    // 5. Use WhatsApp profile name directly (no filtering)
    const contactName = extractContactName(body) ?? undefined;
    logger.info(
      { phone, builderId: builder.id, message: userText },
      "📩 Incoming message"
    );

    await markAsRead(
      builder.phoneNumberId,
      builder.accessToken,
      message.id
    ).catch((err) => logger.warn({ err }, "⚠️ Mark as read failed"));

    const lead = await getOrCreateLead(phone, builder.id, contactName);

    // 6. Opt‑out handling
    if (await handleOptOut(lead, userText, builder, phone)) return;

    // 7. Conversation reset (if needed)
    const conversation = await getActiveConversation(lead, phone);

    // 8. Process the message
    await processIncomingMessage(
      phone,
      userText,
      message.id,
      lead,
      conversation,
      builder
    );
  } catch (error) {
    logger.error({ error }, "❌ Error processing message");
    Sentry.captureException(error);
  }
};
