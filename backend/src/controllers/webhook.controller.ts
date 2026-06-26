import type { Request, Response } from "express";
import { MessageRole, ConversationState, LeadStatus } from "@prisma/client";
import * as crypto from "node:crypto";
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
  updateLeadStatus,
  createNewConversation,
} from "../services/lead.service";
import {
  sendTextMessage,
  markAsRead,
  transcribeVoiceNote,
} from "../services/whatsapp.service";
import {
  getBuilderByPhoneNumberId,
  type BuilderWithToken,
} from "../services/builder.service";
import { scheduleFollowUp } from "../services/followup.service";
import logger from "../utils/logger";
import type {
  WhatsAppWebhookPayload,
  IncomingMessage,
} from "../types/whatsapp.types";
import { prisma } from "../db/client";
import {
  OPT_OUT_PHRASES,
  HUMAN_HANDOFF_PHRASES,
} from "../constants/conversation.phrases";
import { invokeGraph } from "../graph/invokeGraph";
import type { LanguagePref } from "../types/langgraph.types"; 

type LeadWithConversations = Awaited<ReturnType<typeof getOrCreateLead>>;

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
    logger.warn({ token }, "Webhook verification failed");
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.status(200).send(challenge);
};

// ========== Webhook Context Helper (Reduces Cognitive Complexity) ==========
type WebhookContext = {
  builder: BuilderWithToken;
  message: IncomingMessage;
  userText: string;
  phone: string;
  contactName: string | undefined;
} | null;

const getWebhookContext = async (req: Request): Promise<WebhookContext> => {
  const body = req.body as WhatsAppWebhookPayload;
  if (body.object !== "whatsapp_business_account") return null;

  const phoneNumberId = extractPhoneNumberId(body);
  if (!phoneNumberId) return null;

  const builder = await getBuilderByPhoneNumberId(phoneNumberId);
  if (!builder?.isActive) return null;

  const message = extractMessage(body);
  if (!message) return null;

  const userText = await extractUserText(message, builder);
  if (!userText) return null;

  if (await isDuplicate(message.id)) return null;

  return {
    builder,
    message,
    userText,
    phone: normalizePhone(message.from),
    contactName: extractContactName(body) ?? undefined,
  };

};

// ========== POST — Incoming Messages ==========
export const handleIncoming = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(200).json({ status: "ok" });

  try {
    const ctx = await getWebhookContext(req);
    if (!ctx) return;

    const { builder, userText, phone, contactName, message } = ctx;

    await markAsRead(
      builder.phoneNumberId,
      builder.accessToken,
      message.id
    ).catch(() => {});

    let langGraphThreadId: string = crypto.randomUUID();
    let lead = await getOrCreateLead(
      phone,
      builder.id,
      langGraphThreadId,
      contactName
    );

    const activeConvo = lead.conversations.find(
      (c) => c.state === ConversationState.ACTIVE
    );

    // ✅ S6582 fix: Optional chain / logical AND
    if (activeConvo) langGraphThreadId = activeConvo.langGraphThreadId;

    if (await handleOptOut(lead, userText, builder, phone)) return;

    const forceHandoff = HUMAN_HANDOFF_PHRASES.some((p) =>
      userText.toLowerCase().includes(p)
    );

    let conversation = activeConvo;
    if (!conversation || conversation.state === ConversationState.COMPLETED) {
      logger.info({ phone }, "Resetting conversation");
      await updateLead(lead.id, {
        propertyType: null,
        bhk: null,
        location: null,
        purpose: null,
        timeline: null,
        minBudget: null,
        maxBudget: null,
        amenities: null,
        possession: null,
      });
      await updateLeadStatus(lead.id, LeadStatus.NEW);

      langGraphThreadId = crypto.randomUUID();
      conversation = await createNewConversation(lead.id, langGraphThreadId);
    }

    await saveMessage(conversation.id, MessageRole.USER, userText, message.id);

    const graphResult = await invokeGraph({
      leadId: lead.id,
      waId: phone,
      builderId: builder.id,
      conversationId: conversation.id,
      currentMessage: userText,
      languagePref: (conversation.languagePref as LanguagePref) || "english",
      extractedData: {},
      isQualified: false,
      matchedProperties: [],
      botReply: "",
      isSafe: true,
      violationReason: undefined,
      requiresHandoff: forceHandoff,
      shouldFollowUp: false,
      followUpType: undefined,
    });

    if (graphResult.botReply) {
      const isSent = await sendTextMessage(
        builder.phoneNumberId,
        builder.accessToken,
        phone,
        graphResult.botReply
      );
      if (isSent) {
        await saveMessage(
          conversation.id,
          MessageRole.BOT,
          graphResult.botReply
        );
      }
    }

    if (graphResult.shouldFollowUp) {
      await scheduleFollowUp(lead.id, "2H", 2 * 60 * 60 * 1000);
    }

    if (graphResult.requiresHandoff) {
      await updateConversationState(
        conversation.id,
        ConversationState.HUMAN_HANDOFF
      );
      logger.warn({ leadId: lead.id }, "Handoff triggered");
    }

    if (graphResult.isQualified && !graphResult.shouldFollowUp) {
      await updateConversationState(
        conversation.id,
        ConversationState.COMPLETED
      );
    }
  } catch (error) {
    logger.error({ error }, "Error processing webhook");
    Sentry.captureException(error);
  }
};

// ========== Helper Functions ==========

const extractUserText = async (
  msg: IncomingMessage,
  builder: BuilderWithToken
): Promise<string | null> => {
  if (msg.type === "audio" && msg.audio?.id) {
    const transcript = await transcribeVoiceNote(
      builder.accessToken,
      msg.audio.id
    );
    if (!transcript) {
      await sendTextMessage(
        builder.phoneNumberId,
        builder.accessToken,
        normalizePhone(msg.from),
        "Sorry, I couldn't understand the voice note. Please send a text message."
      );
      return null;
    }
    return transcript;
  }

  if (msg.type === "text") return msg.text?.body ?? "";
  if (msg.type === "interactive")
    return msg.interactive?.button_reply?.title ?? "";

  const caption =
    msg.image?.caption || msg.video?.caption || msg.document?.caption;
  if (caption) return caption;

  await sendTextMessage(
    builder.phoneNumberId,
    builder.accessToken,
    normalizePhone(msg.from),
    "Sorry, I can only understand text messages."
  );
  return null;
};

const isDuplicate = async (messageId: string): Promise<boolean> => {
  const exists = await prisma.message.findUnique({
    where: { whatsappMessageId: messageId },
  });
  if (exists) {
    logger.info({ messageId }, "Duplicate skipped");
    return true;
  }
  return false;
};

const handleOptOut = async (
  lead: LeadWithConversations,
  text: string,
  builder: BuilderWithToken,
  phone: string
): Promise<boolean> => {
  const lowerText = text.toLowerCase().trim();
  if (OPT_OUT_PHRASES.some((p) => lowerText.includes(p))) {
    await updateLeadStatus(lead.id, LeadStatus.LOST);
    const activeConvo = lead.conversations.find(
      (c) => c.state === ConversationState.ACTIVE
    );

    // ✅ S6582 fix: Optional logical AND
    activeConvo &&
      (await updateConversationState(
        activeConvo.id,
        ConversationState.OPTED_OUT
      ));

    await sendTextMessage(
      builder.phoneNumberId,
      builder.accessToken,
      phone,
      "You have been opted out. Thank you."
    ).catch(() => {});
    return true;
  }
  return false;
};
