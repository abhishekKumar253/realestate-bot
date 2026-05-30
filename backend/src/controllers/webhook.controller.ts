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

const fieldToState: Record<string, ConversationState> = {
  propertyType: ConversationState.ASK_PROPERTY_TYPE,
  budget: ConversationState.ASK_BUDGET,
  location: ConversationState.ASK_LOCATION,
  bhk: ConversationState.ASK_BHK,
  purpose: ConversationState.ASK_PURPOSE,
  timeline: ConversationState.ASK_TIMELINE,
  name: ConversationState.ASK_NAME,
  amenities: ConversationState.ASK_AMENITIES,
  possession: ConversationState.ASK_POSSESSION,
  loanStatus: ConversationState.ASK_LOAN_STATUS,
  siteVisitDay: ConversationState.ASK_SITE_VISIT_DAY,
};

const hasSiteVisitSignal = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  return (
    SITE_VISIT_AFFIRMATIVE_PATTERNS.some((p) => lower.includes(p)) ||
    lower.includes("site visit") ||
    lower.includes("visit") ||
    lower.includes("weekend") ||
    lower.includes("saturday") ||
    lower.includes("sunday") ||
    lower.includes("office") ||
    lower.includes("milne") ||
    lower.includes("demo") ||
    lower.includes("arrange")
  );
};

const isShortPositiveReply = (text: string): boolean => {
  const lower = text
    .toLowerCase()
    .trim()
    .replace(/[.,!?]/g, "");
  const words = lower.split(/\s+/).filter(Boolean);
  return (
    words.length <= 5 &&
    [
      "haan",
      "ha",
      "ji",
      "yes",
      "ready",
      "taiyaar",
      "tayaar",
      "bilkul",
      "ok",
      "okay",
      "theek hai",
      "theek",
      "haan ji",
      "haanji",
    ].some((p) => lower.includes(p))
  );
};

const getLastAssistantMessage = (
  history: { role: MessageRole; content: string }[]
): string => {
  return (
    [...history].reverse().find((msg) => msg.role === MessageRole.BOT)
      ?.content ?? ""
  );
};

// ✅ Helper: resolve site visit intent
function resolveSiteVisitIntent(
  userText: string,
  extracted: ExtractedLeadData,
  lastAssistantMessage: string
): boolean {
  const lowerMsg = userText.toLowerCase().trim();
  const assistantAskedSiteVisit = hasSiteVisitSignal(lastAssistantMessage);
  const explicitSiteVisitSignal = hasSiteVisitSignal(lowerMsg);
  const shortPositiveReply = isShortPositiveReply(lowerMsg);

  const siteVisitIntent = Boolean(
    extracted.wantsVisit ||
      extracted.siteVisitDay ||
      extracted.siteVisitTime ||
      extracted.visitNote ||
      explicitSiteVisitSignal ||
      (assistantAskedSiteVisit && shortPositiveReply)
  );

  if (
    assistantAskedSiteVisit ||
    explicitSiteVisitSignal ||
    extracted.siteVisitDay ||
    extracted.siteVisitTime ||
    extracted.visitNote
  ) {
    extracted.wantsVisit = siteVisitIntent;
  } else {
    extracted.wantsVisit = false;
  }

  return siteVisitIntent;
}

// ✅ Helper: handle completion (broker notification + status)
async function handleCompletion(
  lead: Awaited<ReturnType<typeof getOrCreateLead>>,
  builder: BuilderWithToken,
  mergedLead: Record<string, unknown>
) {
  await updateLeadStatus(lead.id, LeadStatus.SITE_VISIT_SCHEDULED);

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

const computeNewState = (
  currentState: ConversationState,
  missingFields: string[],
  _wantsVisit: boolean
): ConversationState => {
  if (currentState === ConversationState.COMPLETED)
    return ConversationState.COMPLETED;
  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    return firstMissing && fieldToState[firstMissing]
      ? fieldToState[firstMissing]
      : currentState;
  }
  // CHANGED: directly COMPLETED — site visit alag nahi poochhna
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
  // 1. Conversation history
  const history = await getConversationHistory(conversation.id);
  const historyForOpenAI = history.map((msg) => ({
    role:
      msg.role === MessageRole.USER
        ? ("user" as const)
        : ("assistant" as const),
    content: msg.content,
  }));

  // 2. Extract lead data
  const extracted = await extractLeadData(userText, historyForOpenAI);

  // ✅ Turant typing indicator
  sendTypingIndicator(
    builder.phoneNumberId,
    builder.accessToken,
    phone,
    whatsappMessageId
  ).catch(() => {});

  // 3. Resolve site visit intent
  const lastAssistantMessage = getLastAssistantMessage(history);
  resolveSiteVisitIntent(userText, extracted, lastAssistantMessage);

  // 4. Save user message
  await saveMessage(
    conversation.id,
    MessageRole.USER,
    userText,
    whatsappMessageId
  );

  // 5. Update lead
  const updateData = buildUpdateData(extracted);
  const freshLead =
    Object.keys(updateData).length > 0
      ? await updateLead(lead.id, updateData)
      : lead;

  // 6. mergedLead
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

  // 7. Compute state
  const finalState = computeNewState(
    conversation.state,
    missingFields,
    extracted.wantsVisit ?? false
  );

  // 8. Handle completion
  if (
    finalState === ConversationState.COMPLETED &&
    missingFields.length === 0
  ) {
    await handleCompletion(lead, builder, mergedLead);
  }

  // 9. Update conversation state
  await updateConversationState(conversation.id, finalState);

  // 10. (typing indicator already sent)

  // 11. Generate reply
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

  // 12. Send reply + save bot message
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

// ✅ NEW: Helper for audio message handling (reduces cognitive complexity)
async function processIncomingAudio(
  message: IncomingMessage,
  builder: BuilderWithToken
): Promise<string | null> {
  const mediaId = message.audio?.id;
  if (!mediaId) {
    await sendFallbackIfNeeded(message, builder);
    return null;
  }

  const transcript = await transcribeVoiceNote(
    builder.accessToken,
    mediaId
  );
  if (!transcript) {
    // Transcription failed – send fallback and stop
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
    logger.info({ phone }, "🔄 Conversation reset — new conversation starting");
    conversation = await createNewConversation(lead.id);
    await updateLeadStatus(lead.id, LeadStatus.NEW);
  }
  return conversation;
}

// ========== POST — Incoming Messages (with voice note handling) ==========
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

    // ── Voice Note (Audio) Handling ──
    let userText: string;
    if (message.type === "audio") {
      const transcript = await processIncomingAudio(message, builder);
      if (!transcript) return; // fallback already sent
      userText = transcript;
    } else {
      userText = getUserText(message);
    }

    if (!userText.trim()) return;

    // ── Duplicate check ──
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

    const lead = await getOrCreateLead(
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
