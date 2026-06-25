import { openai } from "../config/openai";
import logger from "../utils/logger";
import { PropertyType, Purpose, Timeline } from "@prisma/client";
import type {
  LanguagePref,
  MatchPropertyOutput,
} from "../types/langgraph.types";

export interface ExtractedLeadData {
  name?: string;
  propertyType?: PropertyType;
  location?: string;
  bhk?: string;
  purpose?: Purpose;
  timeline?: Timeline;
  wantsVisit?: boolean;
  visitNote?: string;
  amenities?: string;
  possession?: string;
  loanStatus?: string;
  siteVisitDay?: string;
  siteVisitTime?: string;
  minBudget?: number;
  maxBudget?: number;
}

const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Hyderabad, Telangana, India.
Your ONLY job is to extract structured data from the CURRENT user message.

Extract the following fields IF AND ONLY IF they are explicitly mentioned:
- name: User's real full name. Do NOT extract greetings as a name.
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- location: Area/locality in Hyderabad (e.g., Gachibowli, Kukatpally, HITEC City).
- bhk: e.g., "1BHK", "2BHK", "3BHK". "2 bedroom" = "2BHK"
- purpose: INVESTMENT or END_USE. (investment keywords → INVESTMENT, family/self → END_USE)
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS.
- wantsVisit: true if user wants to schedule a site visit
- visitNote: any condition about site visit
- amenities: comma separated list (lift, parking, gated society, etc.)
- possession: READY_TO_MOVE or UNDER_CONSTRUCTION
- loanStatus: PRE_APPROVED, APPLIED, NONE
- siteVisitDay, siteVisitTime
- minBudget, maxBudget: integers in INR

CRITICAL RULES:
- NEVER GUESS, INFER, OR ASSUME ANY VALUE.
- ONLY extract what is EXPLICITLY written in the CURRENT message.
- For vague urgency words ("jaldi", "ASAP"), do NOT set timeline.
- Return ONLY valid JSON, no explanation, no markdown.
`;

export const extractLeadData = async (
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<ExtractedLeadData> => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        ...conversationHistory.slice(-3).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return {};
    const extracted = JSON.parse(content) as ExtractedLeadData;
    logger.info({ extracted }, "✅ Lead data extracted");
    return extracted;
  } catch (error) {
    logger.error({ error }, "❌ Failed to extract lead data");
    return {};
  }
};

export const generateReply = async (
  leadData: ExtractedLeadData,
  matchedProperties: MatchPropertyOutput["matchedProperties"],
  conversationHistory: { role: string; content: string }[],
  builderSystemPrompt: string | null,
  languagePref: LanguagePref
): Promise<string> => {
  try {
    const lastUserMessage =
      [...conversationHistory].reverse().find((m) => m.role === "user")
        ?.content ?? "";
    const leadDataStr = JSON.stringify(leadData, null, 2);
    const propertiesStr =
      matchedProperties.length > 0
        ? JSON.stringify(matchedProperties, null, 2)
        : "None";

    const languageInstruction: Record<LanguagePref, string> = {
      english: "Respond EXCLUSIVELY in English. No Hindi or Hinglish.",
      hindi:
        "Respond EXCLUSIVELY in pure Hindi (Devanagari script). No Latin characters.",
      telugu: "Respond EXCLUSIVELY in Telugu script.",
      tamil: "Respond EXCLUSIVELY in Tamil script.",
      hinglish:
        "Respond in natural Hinglish (Latin script, mix of Hindi and English).",
    };

    const prompt = `
You are a professional real estate assistant for builders in Hyderabad, India.
 ${languageInstruction[languagePref]}

Personality: Warm, helpful, natural. Use emojis occasionally (🏠📍💰✅🙏😊).

Current lead data: ${leadDataStr}
Matched properties: ${propertiesStr}
User's last message: "${lastUserMessage}"
 ${builderSystemPrompt ? `Builder specific notes: ${builderSystemPrompt}` : ""}

Rules:
1. Acknowledge user's input briefly and ask the next logical question or suggest a property.
2. If properties are matched, summarize the best option and ask if they want a site visit.
3. Keep replies short, friendly, and professional.
4. If user is rude/off-topic: "Maaf kijiye/Main sorry, I can only help with property inquiries."
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        ...conversationHistory.slice(-6).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      ],
      max_tokens: 350,
      temperature: 0.5,
    });

    return (
      response.choices[0]?.message?.content || getDefaultReply(languagePref)
    );
  } catch (error) {
    logger.error({ error }, "❌ Failed to generate reply");
    return getDefaultReply(languagePref);
  }
};

const getDefaultReply = (languagePref: LanguagePref): string => {
  const replies: Record<LanguagePref, string> = {
    english: "Please share your property requirements.",
    hindi: "कृपया अपनी प्रॉपर्टी की जानकारी साझा करें।",
    telugu: "దయచేసి మీ ప్రాపర్టీ అవసరాలను పంచుకోండి。",
    tamil: "தயவுசெய்து உங்கள் சொத்து தேவைகளைப் பகிர்ந்து கொள்ளுங்கள்.",
    hinglish: "Koi property detail batani ho toh bata dijiye. 😊",
  };
  return replies[languagePref];
};
