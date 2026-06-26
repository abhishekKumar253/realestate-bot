import { LeadKaroState } from "../../types/langgraph.types";
import { validateMessageContent } from "../../services/compliance.service";
import { VALIDATION_FALLBACKS } from "../../constants/conversation.phrases";
import logger from "../../utils/logger";

export const validateResponseNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  try {
    const complianceCheck = validateMessageContent(state.botReply);

    if (!complianceCheck.isSafe) {
      logger.warn(
        { waId: state.waId, reason: complianceCheck.reason },
        "Bot reply violated Meta policy"
      );

      return {
        botReply:
          VALIDATION_FALLBACKS.policyViolation[state.languagePref] ||
          VALIDATION_FALLBACKS.policyViolation.english,
        isSafe: false,
        violationReason: complianceCheck.reason,
      };
    }

    if (state.botReply.length > 4000) {
      logger.warn(
        { waId: state.waId, length: state.botReply.length },
        "Bot reply too long, truncating"
      );

      return {
        botReply: state.botReply.slice(0, 3990) + "...",
        isSafe: true,
      };
    }

    if (!state.botReply.trim()) {
      logger.warn({ waId: state.waId }, "Empty bot reply detected");

      return {
        botReply:
          VALIDATION_FALLBACKS.empty[state.languagePref] ||
          VALIDATION_FALLBACKS.empty.english,
        isSafe: true,
      };
    }

    logger.info({ waId: state.waId }, "Bot reply validated");

    return { isSafe: true };
  } catch (error) {
    logger.error({ error, waId: state.waId }, "Response validation failed");

    return {
      botReply: VALIDATION_FALLBACKS.error.english,
      isSafe: true,
    };
  }
};
