import { LeadKaroState } from "../../types/langgraph.types";
import { sendTextMessage } from "../../services/whatsapp.service";
import { updateConversationState } from "../../services/lead.service";
import { ConversationState } from "@prisma/client";
import { prisma } from "../../db/client";
import { decryptToken } from "../../utils/crypto";
import logger from "../../utils/logger";

export const humanHandoffNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  const { waId, conversationId, botReply, violationReason } = state;

  try {
    await updateConversationState(
      conversationId,
      ConversationState.HUMAN_HANDOFF
    );

    const handoffReason = violationReason
      ? `⚠️ Blocked: ${violationReason}`
      : "User requested human agent.";

    const alertMessage = `🚨 *Human Handoff Triggered*\n\nUser: +${waId}\nReason: ${handoffReason}\nLast Bot Reply: "${
      botReply ? botReply.slice(0, 100) : "N/A"
    }..."\n\nPlease connect with the user immediately.`;

    const builder = await prisma.builder.findUnique({
      where: { id: state.builderId },
      select: {
        phoneNumberId: true,
        encryptedToken: true,
        phoneNumber: true,
        notificationPhone: true,
      },
    });

    const brokerPhone = builder?.notificationPhone || builder?.phoneNumber;
    if (brokerPhone && builder) {
      const accessToken = decryptToken(builder.encryptedToken);
      await sendTextMessage(
        builder.phoneNumberId,
        accessToken,
        brokerPhone,
        alertMessage
      );
    }

    logger.warn({ waId, reason: violationReason }, "Handed over to human");

    return {
      requiresHandoff: true,
      shouldFollowUp: false,
    };
  } catch (error) {
    logger.error({ error, waId }, "Failed to process human handoff");
    return { requiresHandoff: true };
  }
};
