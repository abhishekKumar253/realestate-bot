import { LeadKaroState } from "../../types/langgraph.types";
import { detectLanguage } from "../../utils/helpers";
import logger from "../../utils/logger";

export const detectLanguageNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  const detected = detectLanguage(state.currentMessage);

  const shouldOverride = ["hindi", "telugu", "tamil"].includes(detected);

  logger.info(
    { waId: state.waId, detected, msg: state.currentMessage.slice(0, 50) },
    "Language detected"
  );

  return {
    languagePref: shouldOverride ? detected : state.languagePref,
  };
};
