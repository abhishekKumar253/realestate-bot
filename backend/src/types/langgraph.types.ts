import { Annotation } from "@langchain/langgraph";

export type LanguagePref =
  | "hindi"
  | "english"
  | "hinglish"
  | "telugu"
  | "tamil";

export interface QualifyLeadOutput {
  isQualified: boolean;
  extractedData: {
    propertyType?: string;
    bhk?: string;
    location?: string;
    minBudget?: number;
    maxBudget?: number;
    purpose?: string;
    timeline?: string;
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
