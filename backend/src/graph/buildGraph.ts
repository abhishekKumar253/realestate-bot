import { StateGraph, END, START } from "@langchain/langgraph";
import { LeadKaroGraphState } from "../types/langgraph.types";

// Nodes
import { detectLanguageNode } from "./nodes/detectLanguage.node";
import { qualifyLeadNode } from "./nodes/qualifyLead.node";
import { matchPropertyNode } from "./nodes/matchProperty.node";
import { generateResponseNode } from "./nodes/generateResponse.node";
import { validateResponseNode } from "./nodes/validateResponse.node";
import { humanHandoffNode } from "./nodes/humanHandoff.node";
import { scheduleFollowupNode } from "./nodes/scheduleFollowup.node";

// Edges
import { routerEdge } from "./edges/router.edge";

export const buildGraph = () => {
  const graph = new StateGraph(LeadKaroGraphState)
    .addNode("detectLanguage", detectLanguageNode)
    .addNode("qualifyLead", qualifyLeadNode)
    .addNode("matchProperty", matchPropertyNode)
    .addNode("generateResponse", generateResponseNode)
    .addNode("validateResponse", validateResponseNode)
    .addNode("humanHandoff", humanHandoffNode)
    .addNode("scheduleFollowup", scheduleFollowupNode)
    .addEdge(START, "detectLanguage")
    .addEdge("detectLanguage", "qualifyLead")
    .addEdge("qualifyLead", "matchProperty")
    .addEdge("matchProperty", "generateResponse")
    .addEdge("generateResponse", "validateResponse")
    .addConditionalEdges("validateResponse", routerEdge, {
      humanHandoff: "humanHandoff",
      scheduleFollowup: "scheduleFollowup",
      end: END,
      generateResponse: END,
    })
    .addEdge("humanHandoff", END)
    .addEdge("scheduleFollowup", END);

  return graph.compile();
};
