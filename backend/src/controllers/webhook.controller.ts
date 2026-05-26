import type { Request, Response } from "express";
import { MessageRole, ConversationState, LeadStatus } from "@prisma/client";
import * as Sentry from "@sentry/node";
import {
  extractMessage,
  extractContactName,
  extractPhoneNumberId,
  normalizePhone,
} from "../utils/helpers";
import {
  getOrCreateLead,
  updateLead,
  updateConversationState,
  saveMessage,
  getConversationHistory,
  updateLeadStatus,
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
} from "../services/whatsapp.service";
import { getBuilderByPhoneNumberId, type BuilderWithToken } from "../services/builder.service";
import logger from "../utils/logger";
import type { WhatsAppWebhookPayload, IncomingMessage } from "../types/whatsapp.types";
import { prisma } from "../db/prisma";

// ========== GET — Meta Webhook Verification ==========
export const handleVerification = async (req: Request, res: Response): Promise<void> => {
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
  if (msg.type === "interactive") return msg.interactive?.button_reply?.title ?? "";
  return "";
};

const buildUpdateData = (extracted: ExtractedLeadData): Record<string, unknown> => {
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

const getMissingFields = (lead: Record<string, unknown>): string[] => {
  const required = ["propertyType", "budget", "location", "bhk", "purpose", "timeline", "name"];
  return required.filter((f) => !lead[f]);
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
  conversation: NonNullable<Awaited<ReturnType<typeof getOrCreateLead>>["conversations"][0]>,
  builder: BuilderWithToken
): Promise<void> {
  const history = await getConversationHistory(conversation.id);
  const historyForOpenAI = history.map((msg) => ({
    role: msg.role === MessageRole.USER ? ("user" as const) : ("assistant" as const),
    content: msg.content,
  }));

  const extracted = await extractLeadData(userText, historyForOpenAI);

  if (conversation.state === ConversationState.ASK_SITE_VISIT) {
    const lowerMsg = userText.toLowerCase().trim();
    const affirmativePatterns = [
      "haan", "ha", "yes", "haan ji", "hanji", "ok", "okay", "ready",
      "ready hu", "ready hai", "taiyar hai", "taiyar hu", "chalo", "chaliye",
      "abhi karte hain", "bilkul", "theek hai", "sahi hai", "ji haan",
      "i am ready", "let's go", "sure", "confirmed", "done", "chalega",
      "ham ready", "hum ready", "hai taiyaar", "taiyaar h", "taiyar h",
    ];
    extracted.wantsVisit = affirmativePatterns.some((p) => lowerMsg.includes(p));
  } else {
    extracted.wantsVisit = false;
  }

  // 4. Save user message
  await saveMessage(conversation.id, MessageRole.USER, userText, whatsappMessageId);

  // 5. Update lead
  const updateData = buildUpdateData(extracted);
  const freshLead = Object.keys(updateData).length > 0
    ? await updateLead(lead.id, updateData)
    : lead;

  // 6. Missing fields
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

  // 7. Status + state update
  if (finalState === ConversationState.COMPLETED && missingFields.length === 0) {
    await updateLeadStatus(lead.id, LeadStatus.SITE_VISIT_SCHEDULED);
  }
  await updateConversationState(conversation.id, finalState);

  // 8. Typing indicator
  await sendTypingIndicator(
    builder.phoneNumberId,
    builder.accessToken,
    phone,
    whatsappMessageId
  ).catch((err) => logger.warn({ err }, "⚠️ Typing indicator failed"));

  // 9. Generate reply
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
    builder.systemPrompt
  );

  // 10. Send reply
  const isSent = await sendTextMessage(builder.phoneNumberId, builder.accessToken, phone, reply);
  if (isSent) {
    await saveMessage(conversation.id, MessageRole.BOT, reply);
  }

  logger.info({ phone, state: finalState, builderId: builder.id }, "✅ Message processed");
}

// ========== POST — Incoming Messages ==========
export const handleIncoming = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as WhatsAppWebhookPayload;
    if (body.object !== "whatsapp_business_account") return;

    const phoneNumberId = extractPhoneNumberId(body);
    if (!phoneNumberId) {
      logger.warn("No phone_number_id in webhook");
      return;
    }

    const builder = await getBuilderByPhoneNumberId(phoneNumberId);
    if (!builder) {
      logger.error({ phoneNumberId }, "❌ No active builder found");
      return;
    }
    if (!builder.isActive) {
      logger.warn({ builderId: builder.id }, "⚠️ Builder inactive — ignoring");
      return;
    }

    const message = extractMessage(body);
    if (!message) return;
    if (message.type !== "text" && message.type !== "interactive") return;

    const phone = normalizePhone(message.from);
    const userText = getUserText(message);
    if (!userText.trim()) return;

    // Duplicate check
    const existingMsg = await prisma.message.findUnique({
      where: { whatsappMessageId: message.id },
    });
    if (existingMsg) {
      logger.info({ messageId: message.id }, "⚠️ Duplicate — skipping");
      return;
    }

    const contactName = extractContactName(body) ?? undefined;
    logger.info({ phone, builderId: builder.id, message: userText }, "📩 Incoming message");

    await markAsRead(builder.phoneNumberId, builder.accessToken, message.id)
      .catch((err) => logger.warn({ err }, "⚠️ Mark as read failed"));

    const lead = await getOrCreateLead(phone, builder.id, contactName);
    const conversation = lead.conversations[0];
    if (!conversation) {
      logger.error({ phone }, "❌ No conversation found");
      return;
    }

    await processIncomingMessage(phone, userText, message.id, lead, conversation, builder);
  } catch (error) {
    logger.error({ error }, "❌ Error processing message");
    Sentry.captureException(error);
  }
};