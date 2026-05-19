import type { Request, Response } from "express";
import { MessageRole, ConversationState, LeadStatus } from "@prisma/client";
import * as Sentry from "@sentry/node";
import {
  extractMessage,
  extractContactName,
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
import { sendTextMessage, markAsRead, sendTypingIndicator } from "../services/whatsapp.service";
import logger from "../utils/logger";
import { env } from "../config/index";
import type { WhatsAppWebhookPayload, IncomingMessage } from "../types/whatsapp.types";
import { prisma } from "../db/prisma";

// ========== GET — Meta Webhook Verification ==========
export const handleVerification = (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info("✅ Webhook verified successfully");
    res.status(200).send(challenge);
    return;
  }

  logger.warn("❌ Webhook verification failed");
  res.status(403).json({ error: "Forbidden" });
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

const getMissingFields = (lead: Record<string, unknown>) => {
  const required = [
    "propertyType",
    "budget",
    "location",
    "bhk",
    "purpose",
    "timeline",
    "name",
  ];
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
  wantsVisit?: boolean
): ConversationState => {
  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    return firstMissing && fieldToState[firstMissing]
      ? fieldToState[firstMissing]
      : currentState;
  }

  if (missingFields.length === 0 && wantsVisit) return ConversationState.COMPLETED;
  if (missingFields.length === 0) return ConversationState.ASK_SITE_VISIT;

  return currentState;
};

// ========== Core Message Processing ==========
async function processIncomingMessage(
  phone: string,
  userText: string,
  whatsappMessageId: string,
  lead: Awaited<ReturnType<typeof getOrCreateLead>>,
  conversation: NonNullable<Awaited<ReturnType<typeof getOrCreateLead>>["conversations"][0]>
): Promise<void> {
  // 1. Get conversation history
  const history = await getConversationHistory(conversation.id);
  const historyForOpenAI = history.map((msg) => ({
    role: msg.role === MessageRole.USER ? ("user" as const) : ("assistant" as const),
    content: msg.content,
  }));

  const extracted = await extractLeadData(userText, historyForOpenAI);

  // 3. Manual site-visit intent detection
  if (
    conversation.state === ConversationState.ASK_SITE_VISIT ||
    conversation.state === ConversationState.COMPLETED
  ) {
    const lowerMsg = userText.toLowerCase().trim();
    const affirmativePatterns = [
      "haan", "ha", "yes", "haan ji", "hanji", "ok", "okay", "ready",
      "ready hu", "ready hai", "taiyar hai", "taiyar hu", "chalo", "chaliye",
      "abhi karte hain", "bilkul", "theek hai", "sahi hai", "ji haan",
      "i am ready", "let's go", "sure", "confirmed", "done", "chalega",
      "ham ready", "hum ready",
    ];
    if (affirmativePatterns.some((pattern) => lowerMsg.includes(pattern))) {
      extracted.wantsVisit = true;
    }
  }

  // 4. Save user message with WhatsApp message ID
  await saveMessage(conversation.id, MessageRole.USER, userText, whatsappMessageId);

  // 5. Update lead data
  const updateData = buildUpdateData(extracted);
  if (Object.keys(updateData).length > 0) {
    await updateLead(phone, updateData);
  }

  // 6. Merge data for missing fields
  const mergedLead = {
    propertyType: (updateData.propertyType ?? lead.propertyType) as string | null,
    budget: (updateData.budget ?? lead.budget) as string | null,
    location: (updateData.location ?? lead.location) as string | null,
    bhk: (updateData.bhk ?? lead.bhk) as string | null,
    purpose: (updateData.purpose ?? lead.purpose) as string | null,
    timeline: (updateData.timeline ?? lead.timeline) as string | null,
    name: (updateData.name ?? lead.name) as string | null,
  };

  const missingFields = getMissingFields(mergedLead);
  const newState = computeNewState(conversation.state, missingFields, extracted.wantsVisit);

  // 7. Update conversation state & lead status
  if (newState === ConversationState.COMPLETED && missingFields.length === 0) {
    await updateLeadStatus(phone, LeadStatus.SITE_VISIT_SCHEDULED);
  }
  await updateConversationState(conversation.id, newState);

  // 8. Typing indicator ON while generating reply
  await sendTypingIndicator(phone).catch(err => logger.warn({ err }, "Typing indicator failed"));

  // 9. Generate reply with history
  const reply = await generateReply(
    missingFields,
    {
      name: mergedLead.name ?? undefined,
      propertyType: mergedLead.propertyType as any ?? undefined,
      budget: mergedLead.budget ?? undefined,
      location: mergedLead.location ?? undefined,
      bhk: mergedLead.bhk ?? undefined,
      purpose: mergedLead.purpose as any ?? undefined,
      timeline: mergedLead.timeline as any ?? undefined,
    },
    [...historyForOpenAI, { role: "user" as const, content: userText }]
  );

  // 10. Send reply & save
  const isSent = await sendTextMessage(phone, reply);
  if (isSent) {
    await saveMessage(conversation.id, MessageRole.BOT, reply);
  }

  logger.info({ phone, state: newState }, "✅ Message processed");
}

// ========== POST — Incoming Messages ==========
export const handleIncoming = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as WhatsAppWebhookPayload;
    if (body.object !== "whatsapp_business_account") return;

    const message = extractMessage(body);
    if (!message) return;
    if (message.type !== "text" && message.type !== "interactive") return;

    const phone = normalizePhone(message.from);
    const userText = getUserText(message);
    if (!userText.trim()) return;

    // Duplicate check using WhatsApp message ID
    const existingMsg = await prisma.message.findUnique({
      where: { whatsappMessageId: message.id },
    });
    if (existingMsg) {
      logger.info({ messageId: message.id }, "⚠️ Duplicate message, skipping");
      return;
    }

    const contactName = extractContactName(body) ?? undefined;
    logger.info({ phone, message: userText }, "📩 Incoming message");

    // Mark as read
    await markAsRead(message.id).catch(err =>
      logger.warn({ err }, "Mark as read failed")
    );

    // Get or create lead
    const lead = await getOrCreateLead(phone, contactName);
    const conversation = lead.conversations[0];
    if (!conversation) {
      logger.error({ phone }, "❌ No conversation found");
      return;
    }

    await processIncomingMessage(phone, userText, message.id, lead, conversation);
  } catch (error) {
    logger.error({ error }, "❌ Error processing message");
    Sentry.captureException(error);  // Ensure Sentry gets the error
  }
};