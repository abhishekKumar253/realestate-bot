import type { Request, Response } from "express";
import { MessageRole, ConversationState, LeadStatus } from "@prisma/client";
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
import { sendTextMessage, markAsRead } from "../services/whatsapp.service";
import logger from "../utils/logger";
import { env } from "../config/index";
import type { WhatsAppWebhookPayload, IncomingMessage } from "../types/whatsapp.types";

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

// ========== Pure Helpers (reduce cognitive complexity) ==========

/** Extract user‑readable text from any supported message type */
const getUserText = (msg: IncomingMessage): string => {
  if (msg.type === "text") return msg.text?.body ?? "";
  if (msg.type === "interactive") return msg.interactive?.button_reply?.title ?? "";
  return "";
};

/** Build a flat update payload from extracted data */
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

/** Compute which required fields are still missing */
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

/** Map missing fields to conversation states */
const fieldToState: Record<string, ConversationState> = {
  propertyType: ConversationState.ASK_PROPERTY_TYPE,
  budget: ConversationState.ASK_BUDGET,
  location: ConversationState.ASK_LOCATION,
  bhk: ConversationState.ASK_BHK,
  purpose: ConversationState.ASK_PURPOSE,
  timeline: ConversationState.ASK_TIMELINE,
  name: ConversationState.ASK_NAME,
};

/** Determine next conversation state based on missing data */
const computeNewState = (
  currentState: ConversationState,
  missingFields: string[],
  wantsVisit?: boolean
): ConversationState => {
  if (missingFields.length === 0 || wantsVisit) return ConversationState.COMPLETED;
  const firstMissing = missingFields[0];
  return firstMissing && fieldToState[firstMissing]
    ? fieldToState[firstMissing]
    : currentState;
};

// ========== POST — Incoming Messages ==========
export const handleIncoming = async (req: Request, res: Response): Promise<void> => {
  // Meta expects a quick 200 OK, otherwise it will retry
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

    const contactName = extractContactName(body) ?? undefined;
    logger.info({ phone, message: userText }, "📩 Incoming message");

    // 1. Mark as read
    await markAsRead(message.id);

    // 2. Get or create lead
    const lead = await getOrCreateLead(phone, contactName);
    const conversation = lead.conversations[0];
    if (!conversation) {
      logger.error({ phone }, "❌ No conversation found");
      return;
    }

    // 3. Prepare conversation history (without current message)
    const history = await getConversationHistory(conversation.id);
    const historyForOpenAI = history.map((msg) => ({
      role: msg.role === MessageRole.USER ? ("user" as const) : ("assistant" as const),
      content: msg.content,
    }));

    // 4. Extract lead data (using current message + history)
    const extracted = await extractLeadData(userText, historyForOpenAI);

    // 5. Save user message
    await saveMessage(conversation.id, MessageRole.USER, userText);

    // 6. Update lead if any data extracted
    const updateData = buildUpdateData(extracted);
    if (Object.keys(updateData).length > 0) {
      await updateLead(phone, updateData);
    }

    // 7. Compute missing fields and new state
    const updatedLead = { ...lead, ...updateData };
    const missingFields = getMissingFields(updatedLead);
    const newState = computeNewState(conversation.state, missingFields, extracted.wantsVisit);

    // 8. Persist new state & maybe status
    if (newState === ConversationState.COMPLETED && missingFields.length === 0) {
      await updateLeadStatus(phone, LeadStatus.SITE_VISIT_SCHEDULED);
    }
    await updateConversationState(conversation.id, newState);

    // 9. Generate reply
    const reply = await generateReply(
      missingFields,
      {
        name: updatedLead.name ?? undefined,
        propertyType: updatedLead.propertyType ?? undefined,
        budget: updatedLead.budget ?? undefined,
        location: updatedLead.location ?? undefined,
        bhk: updatedLead.bhk ?? undefined,
        purpose: updatedLead.purpose ?? undefined,
        timeline: updatedLead.timeline ?? undefined,
      },
      historyForOpenAI
    );

    // 10. Send reply, then save if sent
    const isSent = await sendTextMessage(phone, reply);
    if (isSent) {
      await saveMessage(conversation.id, MessageRole.BOT, reply);
    }

    logger.info({ phone, state: newState }, "✅ Message processed");
  } catch (error) {
    logger.error({ error }, "❌ Error processing message");
  }
};