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
  transcribeVoiceNote,
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
import {
  REQUIRED_LEAD_FIELDS,
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

  // ─── Simple truthy fields (no enum) ────────────────────────────
  const simpleFields: (keyof ExtractedLeadData)[] = [
    "name",
    "budget",
    "location",
    "bhk",
    "siteVisitDay",
    "siteVisitTime",
    "visitNote",
    "otherPropertyTypes",
  ];

  for (const field of simpleFields) {
    const value = extracted[field];
    if (value) data[field] = value;
  }

  // ─── Enum validations ──────────────────────────────────────────
  const validPropertyTypes = new Set([
    "APARTMENT",
    "VILLA",
    "PLOT",
    "COMMERCIAL",
  ]);
  if (
    extracted.propertyType &&
    validPropertyTypes.has(extracted.propertyType)
  ) {
    data.propertyType = extracted.propertyType;
  }

  const validPurposes = new Set(["INVESTMENT", "END_USE"]);
  if (extracted.purpose && validPurposes.has(extracted.purpose)) {
    data.purpose = extracted.purpose;
  }

  const validPossession = new Set(["READY_TO_MOVE", "UNDER_CONSTRUCTION"]);
  if (extracted.possession && validPossession.has(extracted.possession)) {
    data.possession = extracted.possession;
  }

  const validLoanStatus = new Set(["PRE_APPROVED", "APPLIED", "NONE"]);
  if (extracted.loanStatus && validLoanStatus.has(extracted.loanStatus)) {
    data.loanStatus = extracted.loanStatus;
  }

  const validTimelines = new Set([
    "ONE_MONTH",
    "THREE_MONTHS",
    "SIX_MONTHS",
    "MORE_THAN_SIX_MONTHS",
  ]);
  if (extracted.timeline && validTimelines.has(extracted.timeline)) {
    data.timeline = extracted.timeline;
  }

  // ─── Numeric fields ────────────────────────────────────────────
  if (extracted.minBudget !== undefined) data.minBudget = extracted.minBudget;
  if (extracted.maxBudget !== undefined) data.maxBudget = extracted.maxBudget;

  return data;
};

const getMissingFields = (lead: Record<string, unknown>): string[] => {
  return [...REQUIRED_LEAD_FIELDS].filter((f) => !lead[f]);
};

// fieldToState – only used states for rapid mode (rest commented)
const fieldToState: Record<string, ConversationState> = {
  propertyType: ConversationState.ASK_PROPERTY_TYPE,
  budget: ConversationState.ASK_BUDGET,
  location: ConversationState.ASK_LOCATION,
  bhk: ConversationState.ASK_BHK,
  purpose: ConversationState.ASK_PURPOSE,
  timeline: ConversationState.ASK_TIMELINE,
  name: ConversationState.ASK_NAME,
};

// ✅ Helper: handle completion (broker notification + status)
async function handleCompletion(
  lead: Awaited<ReturnType<typeof getOrCreateLead>>,
  builder: BuilderWithToken,
  mergedLead: Record<string, unknown>
) {
  await updateLeadStatus(lead.id, LeadStatus.QUALIFIED);

  if (builder.notificationPhone) {
    await sendLeadNotification(
      builder.phoneNumberId,
      builder.accessToken,
      builder.notificationPhone,
      {
        name: mergedLead.name as string | null,
        phone: lead.phone,
        propertyType: mergedLead.propertyType as string | null,
        budget: mergedLead.budget as string | null,
        location: mergedLead.location as string | null,
        bhk: mergedLead.bhk as string | null,
        purpose: mergedLead.purpose as string | null,
        timeline: mergedLead.timeline as string | null,
        amenities: mergedLead.amenities as string | null,
        possession: mergedLead.possession as string | null,
        loanStatus: mergedLead.loanStatus as string | null,
        siteVisitDay: mergedLead.siteVisitDay as string | null,
        siteVisitTime: mergedLead.siteVisitTime as string | null,
        otherPropertyTypes: mergedLead.otherPropertyTypes as string | null,
        minBudget: mergedLead.minBudget as number | null,
        maxBudget: mergedLead.maxBudget as number | null,
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

// Compute new state – removed _wantsVisit parameter
const computeNewState = (
  currentState: ConversationState,
  missingFields: string[]
): ConversationState => {
  if (currentState === ConversationState.COMPLETED)
    return ConversationState.COMPLETED;
  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    return firstMissing && fieldToState[firstMissing]
      ? fieldToState[firstMissing]
      : currentState;
  }
  return ConversationState.COMPLETED;
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

  sendTypingIndicator(
    builder.phoneNumberId,
    builder.accessToken,
    phone,
    whatsappMessageId
  ).catch(() => {});

  extracted.wantsVisit = false;

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
    amenities: freshLead.amenities,
    possession: freshLead.possession,
    loanStatus: freshLead.loanStatus,
    siteVisitDay: freshLead.siteVisitDay,
    siteVisitTime: freshLead.siteVisitTime,
    otherPropertyTypes: freshLead.otherPropertyTypes,
    minBudget: freshLead.minBudget,
    maxBudget: freshLead.maxBudget,
  };

  const missingFields = getMissingFields(mergedLead);
  const finalState = computeNewState(conversation.state, missingFields);

  if (
    finalState === ConversationState.COMPLETED &&
    missingFields.length === 0
  ) {
    await handleCompletion(freshLead, builder, mergedLead);
  }

  await updateConversationState(conversation.id, finalState);

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
      amenities: mergedLead.amenities ?? undefined,
      possession: mergedLead.possession ?? undefined,
      loanStatus: mergedLead.loanStatus ?? undefined,
      siteVisitDay: mergedLead.siteVisitDay ?? undefined,
      siteVisitTime: mergedLead.siteVisitTime ?? undefined,
      otherPropertyTypes: mergedLead.otherPropertyTypes ?? undefined,
      minBudget: mergedLead.minBudget ?? undefined,
      maxBudget: mergedLead.maxBudget ?? undefined,
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

// ========== Handler Helpers ==========

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

async function processIncomingAudio(
  message: IncomingMessage,
  builder: BuilderWithToken
): Promise<string | null> {
  const mediaId = message.audio?.id;
  if (!mediaId) {
    await sendFallbackIfNeeded(message, builder);
    return null;
  }

  const transcript = await transcribeVoiceNote(builder.accessToken, mediaId);
  if (!transcript) {
    await sendTextMessage(
      builder.phoneNumberId,
      builder.accessToken,
      normalizePhone(message.from),
      "Maaf kijiye, main aapka voice note samajh nahi paaya. Kripya text message bhej dijiye. 🙏"
    );
    return null;
  }

  return transcript;
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
      logger.warn({ err }, "Failed to send opt-out confirmation")
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
    logger.info({ phone }, "🔄 Conversation reset — clearing old lead fields");
    await updateLead(lead.id, {
      propertyType: null,
      bhk: null,
      location: null,
      budget: null,
      timeline: null,
      amenities: null,
      possession: null,
      loanStatus: null,
      siteVisitDay: null,
      siteVisitTime: null,
      purpose: null,
      minBudget: null,
      maxBudget: null,
      otherPropertyTypes: null,
    });
    conversation = await createNewConversation(lead.id);
    await updateLeadStatus(lead.id, LeadStatus.NEW);
  }
  return conversation;
}

// ========== NEW Helper: extract user text from message (reduces cognitive complexity) ==========
async function extractUserTextFromMessage(
  message: IncomingMessage,
  builder: BuilderWithToken
): Promise<string | null> {
  // Audio -> transcription
  if (message.type === "audio") {
    const transcript = await processIncomingAudio(message, builder);
    return transcript; // processIncomingAudio already sends fallback on failure, returns null
  }

  // Check for caption on media messages
  const hasCaption =
    (message.type === "image" && message.image?.caption) ||
    (message.type === "video" && message.video?.caption) ||
    (message.type === "document" && message.document?.caption);

  if (hasCaption) {
    return (
      (message as any).image?.caption ??
      (message as any).video?.caption ??
      (message as any).document?.caption ??
      ""
    );
  }

  // Normal text / interactive
  if (message.type === "text" || message.type === "interactive") {
    return getUserText(message);
  }

  // Unsupported type (no caption, not audio, not text/interactive)
  await sendTextMessage(
    builder.phoneNumberId,
    builder.accessToken,
    normalizePhone(message.from),
    "Maaf kijiye, main abhi sirf text messages samajh sakta hoon. 🙏 Kripya apni property requirement type karke bhej dijiye. 🏠"
  );
  return null;
}

// ========== POST — Incoming Messages (refactored for low cognitive complexity) ==========
export const handleIncoming = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as WhatsAppWebhookPayload;
    if (body.object !== "whatsapp_business_account") return;

    const phoneNumberId = extractPhoneNumberId(body);
    if (!phoneNumberId) {
      logger.warn("No phone_number_id in webhook");
      return;
    }

    const builder = await fetchActiveBuilder(phoneNumberId);
    if (!builder) return;

    const message = extractMessage(body);
    if (!message) return;

    const userText = await extractUserTextFromMessage(message, builder);
    if (!userText) return; // fallback already sent inside extractor

    if (await isDuplicate(message.id)) return;

    const contactName = extractContactName(body) ?? undefined;
    logger.info(
      {
        phone: normalizePhone(message.from),
        builderId: builder.id,
        message: userText,
      },
      "📩 Incoming message"
    );

    await markAsRead(
      builder.phoneNumberId,
      builder.accessToken,
      message.id
    ).catch((err) => logger.warn({ err }, "⚠️ Mark as read failed"));

    let lead = await getOrCreateLead(
      normalizePhone(message.from),
      builder.id,
      contactName
    );

    if (
      await handleOptOut(lead, userText, builder, normalizePhone(message.from))
    )
      return;

    const conversation = await getActiveConversation(
      lead,
      normalizePhone(message.from)
    );

    // Refresh lead after reset if needed
    if (conversation.state === ConversationState.GREETING) {
      lead = await getOrCreateLead(
        normalizePhone(message.from),
        builder.id,
        contactName
      );
    }

    await processIncomingMessage(
      normalizePhone(message.from),
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
