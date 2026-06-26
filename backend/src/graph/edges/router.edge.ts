import { LeadKaroState } from "../../types/langgraph.types";

export const routerEdge = (state: LeadKaroState): string => {
  // 1. Opt-out / human handoff priority
  if (state.requiresHandoff) return "humanHandoff";

  // 2. Compliance violation
  if (!state.isSafe) return "end";

  // 3. Qualified lead → schedule follow-up + alert
  if (state.isQualified) return "scheduleFollowup";

  // 4. Normal flow → continue conversation
  return "generateResponse";
};
