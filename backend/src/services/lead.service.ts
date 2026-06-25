import { prisma } from "../db/client";
import logger from "../utils/logger";
import {
  LeadStatus,
  PropertyType,
  Purpose,
  Timeline,
  ConversationState,
  MessageRole,
} from "@prisma/client";

export interface LeadUpdateData {
  name?: string | null;
  propertyType?: PropertyType | null;
  location?: string | null;
  bhk?: string | null;
  purpose?: Purpose | null;
  timeline?: Timeline | null;
  status?: LeadStatus;
  amenities?: string | null;
  possession?: string | null;
  loanStatus?: string | null;
  siteVisitDay?: string | null;
  siteVisitTime?: string | null;
  minBudget?: number | null;
  maxBudget?: number | null;
}

// ========== Get or Create Lead ==========
export const getOrCreateLead = async (
  phone: string,
  builderId: string,
  langGraphThreadId: string,
  name?: string
) => {
  try {
    const lead = await prisma.lead.upsert({
      where: {
        phone_builderId: { phone, builderId },
      },
      update: {
        name: name ?? undefined,
      },
      create: {
        phone,
        name,
        builderId,
        status: LeadStatus.NEW,
        conversations: {
          create: {
            langGraphThreadId,
            state: ConversationState.ACTIVE,
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
    logger.error(
      { error, conversationId },
      "❌ Failed to update conversation state"
    );
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
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error as { code?: string; meta?: { target?: string[] } }).code ===
        "P2002" &&
      (
        error as { code?: string; meta?: { target?: string[] } }
      ).meta?.target?.includes("whatsappMessageId")
    ) {
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
    logger.error(
      { error, conversationId },
      "❌ Failed to get conversation history"
    );
    throw error;
  }
};

// ========== Update Lead Status ==========
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
export const createNewConversation = async (
  leadId: string,
  langGraphThreadId: string
) => {
  try {
    const conversation = await prisma.conversation.create({
      data: {
        leadId,
        langGraphThreadId,
        state: ConversationState.ACTIVE,
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
