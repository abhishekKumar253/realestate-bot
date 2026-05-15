import OpenAI from "openai";
import { env } from "../config/index";
import logger from "../utils/logger";
import {
  PropertyType,
  Purpose,
  Timeline,
} from "@prisma/client";

const openai = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

// ========== Extracted Lead Data Type ==========
export interface ExtractedLeadData {
  name?: string;
  propertyType?: PropertyType;
  budget?: string;
  location?: string;
  bhk?: string;
  purpose?: Purpose;
  timeline?: Timeline;
  wantsVisit?: boolean;
}

// ========== System Prompt ==========
const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Ranchi, Jharkhand, India.
Your ONLY job is to extract structured data from user messages.

Extract the following fields if mentioned:
- name: User's name
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Budget in Indian format (e.g., "50L", "1Cr", "30-50L")
- location: Area/locality in Ranchi they prefer
- bhk: BHK preference (e.g., "1BHK", "2BHK", "3BHK")
- purpose: INVESTMENT or END_USE
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS
- wantsVisit: true if user wants to schedule a site visit

Rules:
- Return ONLY valid JSON, no explanation, no markdown.
- If a field is not mentioned, omit it from the response.
- If user says "ghar", "flat", "makan" — treat as APARTMENT.
- If user says "zameen", "plot" — treat as PLOT.
- If user says "invest karna hai" — purpose is INVESTMENT.
- If user says "rehna hai", "khud ke liye" — purpose is END_USE.
- If user says "jaldi chahiye", "1 mahine mein" — timeline is ONE_MONTH.
- If user says "3 mahine", "teen mahine" — timeline is THREE_MONTHS.
- If user says "6 mahine" — timeline is SIX_MONTHS.
- If user says "koi jaldi nahi", "baad mein" — timeline is MORE_THAN_SIX_MONTHS.
`;

// ========== Extract Lead Data from Message ==========
export const extractLeadData = async (
  userMessage: string,
  conversationHistory: { role: string; content: string }[]
): Promise<ExtractedLeadData> => {
  if (!openai) {
    logger.warn("⚠️ OpenAI not configured — skipping extraction");
    return {};
  }

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 300,
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

// ========== Generate Bot Reply ==========
export const generateReply = async (
  missingFields: string[],
  leadData: ExtractedLeadData,
  conversationHistory: { role: string; content: string }[]
): Promise<string> => {
  if (!openai) {
    return getDefaultReply(missingFields);
  }

  try {
    const systemPrompt = `
You are a friendly real estate assistant for a property business in Ranchi, Jharkhand, India.
You help customers find their perfect property.

Current lead data collected so far:
${JSON.stringify(leadData, null, 2)}

Missing information needed: ${missingFields.join(", ")}

Rules:
- LANGUAGE DETECTION: Detect the language of the user's last message and reply in the SAME language.
  - If user writes in English → reply in English
  - If user writes in Hindi → reply in Hindi
  - If user writes in Hinglish → reply in Hinglish
- Ask for MAXIMUM 2 missing fields at a time — never interrogate.
- Keep responses short (2-3 lines max).
- Friendly and casual tone always.
- Never answer general questions — only real estate related.
- If user asks something unrelated, politely redirect in their language.
- If all data collected, confirm and offer site visit.
`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 150,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content;
    if (!reply) return getDefaultReply(missingFields);

    logger.info("✅ Reply generated");
    return reply;
  } catch (error) {
    logger.error({ error }, "❌ Failed to generate reply");
    return getDefaultReply(missingFields);
  }
};

// ========== Default Reply (OpenAI unavailable) ==========
const getDefaultReply = (missingFields: string[]): string => {
  const fieldMessages: Record<string, string> = {
    propertyType: "Aap kaunsi property dekhna chahte hain? Flat, Plot, Villa ya Commercial?",
    budget: "Aapka budget kya hai?",
    location: "Ranchi mein kaunsa area prefer karenge?",
    bhk: "Kitne BHK chahiye?",
    purpose: "Kya yeh investment ke liye hai ya khud rehne ke liye?",
    timeline: "Kab tak lena hai property?",
    name: "Aapka naam kya hai?",
    wantsVisit: "Kya aap site visit schedule karna chahenge?",
  };

  const field = missingFields[0];
  return field
    ? (fieldMessages[field] ?? "Kya aur kuch batana chahenge?")
    : "Shukriya! Hamara agent aapko jald contact karega. 🙏";
};