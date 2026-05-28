import { prisma } from "../db/prisma";
import logger from "../utils/logger";
import {
  LeadStatus,
  PropertyType,
  Purpose,
  Timeline,
  ConversationState,
  MessageRole,
} from "@prisma/client";

// ========== Types ==========
export interface LeadUpdateData {
  name?: string;
  propertyType?: PropertyType;
  budget?: string;
  location?: string;
  bhk?: string;
  purpose?: Purpose;
  timeline?: Timeline;
  status?: LeadStatus;
}

// ========== Get or Create Lead ==========
// CHANGED: builderId required — composite key (phone + builderId)
export const getOrCreateLead = async (
  phone: string,
  builderId: string,
  name?: string
) => {
  try {
    const lead = await prisma.lead.upsert({
      where: {
        phone_builderId: { phone, builderId }, // composite unique key
      },
      update: {},
      create: {
        phone,
        name,
        builderId,
        status: LeadStatus.NEW,
        conversations: {
          create: {
            state: ConversationState.GREETING,
          },
        },
      },
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20,
            },
          },
        },
      },
    });

    if (lead.createdAt.getTime() === lead.updatedAt.getTime()) {
      logger.info({ phone, builderId }, "✅ New lead created");
    }

    return lead;
  } catch (error) {
    logger.error({ error, phone, builderId }, "❌ Failed to upsert lead");
    throw error;
  }
};

// ========== Update Lead ==========
// CHANGED: where: { phone } → where: { id: leadId }
export const updateLead = async (leadId: string, data: LeadUpdateData) => {
  try {
    const updated = await prisma.lead.update({
      where: { id: leadId },
      data,
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 20,
            },
          },
        },
      },
    });

    logger.info({ leadId, data }, "✅ Lead updated");
    return updated;
  } catch (error) {
    logger.error({ error, leadId }, "❌ Failed to update lead");
    throw error;
  }
};

// ========== Update Conversation State ==========
export const updateConversationState = async (
  conversationId: string,
  state: ConversationState
): Promise<void> => {
  try {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { state },
    });

    logger.info({ conversationId, state }, "✅ Conversation state updated");
  } catch (error) {
    logger.error({ error, conversationId }, "❌ Failed to update conversation state");
    throw error;
  }
};

// ========== Save Message ==========
export const saveMessage = async (
  conversationId: string,
  role: MessageRole,
  content: string,
  whatsappMessageId?: string
): Promise<void> => {
  try {
    await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        whatsappMessageId: whatsappMessageId ?? null,
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002" && error?.meta?.target?.includes("whatsappMessageId")) {
      logger.warn({ whatsappMessageId }, "⚠️ Duplicate message skipped");
      return;
    }
    logger.error({ error, conversationId }, "❌ Failed to save message");
    throw error;
  }
};

// ========== Get Conversation History ==========
export const getConversationHistory = async (conversationId: string) => {
  try {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
  } catch (error) {
    logger.error({ error, conversationId }, "❌ Failed to get conversation history");
    throw error;
  }
};

// ========== Update Lead Status ==========
// CHANGED: where: { phone } → where: { id: leadId }
export const updateLeadStatus = async (
  leadId: string,
  status: LeadStatus
): Promise<void> => {
  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status },
    });

    logger.info({ leadId, status }, "✅ Lead status updated");
  } catch (error) {
    logger.error({ error, leadId }, "❌ Failed to update lead status");
    throw error;
  }
};

// ========== Get Lead Summary ==========
// CHANGED: where: { phone } → where: { id: leadId }
export const getLeadSummary = async (leadId: string) => {
  try {
    return await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  } catch (error) {
    logger.error({ error, leadId }, "❌ Failed to get lead summary");
    throw error;
  }
};

// ========== Create New Conversation (Reset) ==========
export const createNewConversation = async (leadId: string) => {
  try {
    const conversation = await prisma.conversation.create({
      data: {
        leadId,
        state: ConversationState.GREETING,
      },
      include: {
        messages: true,
      },
    });

    logger.info({ leadId }, "✅ New conversation created (reset)");
    return conversation;
  } catch (error) {
    logger.error({ error, leadId }, "❌ Failed to create new conversation");
    throw error;
  }
};