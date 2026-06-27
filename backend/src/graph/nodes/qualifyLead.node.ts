import { LeadKaroState } from "../../types/langgraph.types";
import {
  extractLeadData,
  ExtractedLeadData,
} from "../../services/openai.service";
import { prisma } from "../../db/client";
import logger from "../../utils/logger";

const REQUIRED_FIELDS: (keyof ExtractedLeadData)[] = ["location", "bhk"];

export const qualifyLeadNode = async (
  state: LeadKaroState
): Promise<Partial<LeadKaroState>> => {
  try {
    const history = await prisma.message.findMany({
      where: { conversationId: state.conversationId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { role: true, content: true },
    });

    const newExtractedData = await extractLeadData(
      state.currentMessage,
      history.toReversed().map((m) => ({
        role: m.role === "BOT" ? "assistant" : "user",
        content: m.content,
      }))
    );

    // Sirf defined values merge karo
    const mergedData: ExtractedLeadData = {
      ...(state.extractedData as ExtractedLeadData),
    };
    (Object.keys(newExtractedData) as (keyof ExtractedLeadData)[]).forEach(
      (key) => {
        const value = newExtractedData[key];
        if (value !== undefined && value !== null && value !== "") {
          (mergedData as Record<keyof ExtractedLeadData, unknown>)[key] = value;
        }
      }
    );

    const hasBudget =
      mergedData.minBudget !== undefined || mergedData.maxBudget !== undefined;

    const isQualified =
      REQUIRED_FIELDS.every(
        (field) =>
          mergedData[field] !== undefined &&
          mergedData[field] !== null &&
          mergedData[field] !== ""
      ) && hasBudget;

    if (isQualified && !state.isQualified) {
      logger.info({ waId: state.waId, data: mergedData }, "Lead qualified");
    }

    return { extractedData: mergedData, isQualified };
  } catch (error) {
    logger.error({ error, waId: state.waId }, "OpenAI extraction failed");
    return { extractedData: state.extractedData, isQualified: false };
  }
};
