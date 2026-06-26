import type { LeadKaroState } from "../types/langgraph.types";

export const invokeGraph = async (
  state: Partial<LeadKaroState>
): Promise<LeadKaroState> => {
  return {
    waId: state.waId || "",
    builderId: state.builderId || "",
    conversationId: state.conversationId || "",
    currentMessage: state.currentMessage || "",
    languagePref: state.languagePref || "english",
    extractedData: {},
    isQualified: false,
    matchedProperties: [],
    botReply:
      "Hello! 👋 I'm here to help you find the perfect property in Hyderabad. Which area are you interested in?",
    isSafe: true,
    violationReason: undefined, // ← ADD
    requiresHandoff: false,
    shouldFollowUp: false,
  };
};
