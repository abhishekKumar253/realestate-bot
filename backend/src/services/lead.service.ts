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
export interface LeadData {
  phone: string;
  name?: string;
  propertyType?: PropertyType;
  budget?: string;
  location?: string;
  bhk?: string;
  purpose?: Purpose;
  timeline?: Timeline;
}

// ========== Get or Create Lead ==========
export const getOrCreateLead = async (phone: string, name?: string) => {
  try {
    const lead = await prisma.lead.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        name,
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
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    if (lead.createdAt.getTime() === lead.updatedAt.getTime()) {
      logger.info({ phone }, "✅ New lead created successfully");
    }

    return lead;
  } catch (error) {
    logger.error({ error, phone }, "❌ Failed to upsert lead");
    throw error;
  }
};

// ========== Update Lead Data ==========
export const updateLead = async (
  phone: string,
  data: Partial<LeadData>
): Promise<void> => {
  try {
    await prisma.lead.update({
      where: { phone },
      data,
    });

    logger.info({ phone, data }, "✅ Lead updated");
  } catch (error) {
    logger.error({ error, phone }, "❌ Failed to update lead");
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
  content: string
): Promise<void> => {
  try {
    await prisma.message.create({
      data: {
        conversationId,
        role,
        content,
      },
    });
  } catch (error) {
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
export const updateLeadStatus = async (
  phone: string,
  status: LeadStatus
): Promise<void> => {
  try {
    await prisma.lead.update({
      where: { phone },
      data: { status },
    });

    logger.info({ phone, status }, "✅ Lead status updated");
  } catch (error) {
    logger.error({ error, phone }, "❌ Failed to update lead status");
    throw error;
  }
};

// ========== Get Lead Summary ==========
export const getLeadSummary = async (phone: string) => {
  try {
    return await prisma.lead.findUnique({
      where: { phone },
      include: {
        conversations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  } catch (error) {
    logger.error({ error, phone }, "❌ Failed to get lead summary");
    throw error;
  }
};