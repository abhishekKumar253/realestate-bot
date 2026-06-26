import { buildGraph } from "./buildGraph";
import type { LeadKaroState } from "../types/langgraph.types";

const graph = buildGraph();

export const invokeGraph = async (
  state: LeadKaroState
): Promise<LeadKaroState> => {
  const result = await graph.invoke(state);
  return result;
};
