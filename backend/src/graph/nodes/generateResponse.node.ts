import { LeadKaroState } from "../../types/langgraph.types";
import { generateReply } from "../../services/openai.service";
import { getConversationHistory } from "../../services/lead.service";
import { FALLBACK_REPLIES } from "../../constants/conversation.phrases";
import { prisma } from "../../db/client";
import logger from "../../utils/logger";

export const generateResponseNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  try {
    const [historyRows, builder] = await Promise.all([
      getConversationHistory(state.conversationId),
      prisma.builder.findUnique({
        where: { id: state.builderId },
        select: { systemPrompt: true },
      }),
    ]);

    const historyForOpenAI = historyRows.map((msg) => ({
      role: msg.role === "USER" ? "user" : "assistant",
      content: msg.content,
    }));

    const botReply = await generateReply(
      state.extractedData,
      state.matchedProperties,
      historyForOpenAI,
      builder?.systemPrompt ?? null,
      state.languagePref
    );

    logger.info(
      { waId: state.waId, replyLength: botReply.length },
      "Reply generated"
    );

    return { botReply, isSafe: true }; 
  } catch (error) {
    logger.error({ error, waId: state.waId }, "Failed to generate reply");
    return {
      botReply:
        FALLBACK_REPLIES[state.languagePref] ?? FALLBACK_REPLIES.english,
      isSafe: true,
    };
  }
};
