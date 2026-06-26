import { Annotation } from "@langchain/langgraph";
import { PropertyType, Purpose, Timeline } from "@prisma/client";

export type LanguagePref =
  | "hindi"
  | "english"
  | "hinglish"
  | "telugu"
  | "tamil";

export interface QualifyLeadOutput {
  isQualified: boolean;
  extractedData: {
    propertyType?: PropertyType;
    bhk?: string;
    location?: string;
    minBudget?: number;
    maxBudget?: number;
    purpose?: Purpose;
    timeline?: Timeline;
    wantsVisit?: boolean;
  };
}

export interface MatchPropertyOutput {
  matchedProperties: {
    id: string;
    name: string;
    bhk: string;
    price: number;
    location: string;
  }[];
}

export const LeadKaroGraphState = Annotation.Root({
  leadId: Annotation<string>,
  waId: Annotation<string>,
  builderId: Annotation<string>,
  conversationId: Annotation<string>,
  currentMessage: Annotation<string>,
  languagePref: Annotation<LanguagePref>,
  extractedData: Annotation<QualifyLeadOutput["extractedData"]>,
  isQualified: Annotation<boolean>,
  matchedProperties: Annotation<MatchPropertyOutput["matchedProperties"]>,
  botReply: Annotation<string>,
  isSafe: Annotation<boolean>,
  violationReason: Annotation<string | undefined>,
  requiresHandoff: Annotation<boolean>,
  shouldFollowUp: Annotation<boolean>,
  followUpType: Annotation<"2H" | "24H" | "72H" | undefined>,
});

export type LeadKaroState = typeof LeadKaroGraphState.State;
