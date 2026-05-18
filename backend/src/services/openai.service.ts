import OpenAI from "openai";
import { env } from "../config/index";
import logger from "../utils/logger";
import { PropertyType, Purpose, Timeline } from "@prisma/client";

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
  visitNote?: string;
}

// ========== Intent Classifier (pre-LLM guard) ==========
export const isPropertyRelated = async (message: string): Promise<boolean> => {
  if (!openai) return true; // allow all if no OpenAI

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Classify if the user message is about real estate (buying, selling, renting property, flats, apartments, plots, commercial shops, site visits, budgets, locations, BHK, property investment, etc.) in Ranchi. Reply ONLY with "YES" or "NO".`,
        },
        { role: "user", content: message },
      ],
      max_tokens: 3,
      temperature: 0,
    });

    const answer = response.choices[0]?.message?.content?.trim().toUpperCase();
    return answer === "YES";
  } catch (error) {
    logger.error({ error }, "Intent classifier failed, allowing message");
    return true;
  }
};

// ========== Enhanced Extraction Prompt (anti-hallucination) ==========
const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Ranchi, Jharkhand, India.
Your ONLY job is to extract structured data from user messages.

Extract the following fields IF AND ONLY IF they are explicitly mentioned in the current message:
- name: User's name
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Budget in Indian format (e.g., "50L", "1Cr", "30-50L")
- location: Area/locality in Ranchi they prefer
- bhk: BHK preference (e.g., "1BHK", "2BHK", "3BHK")
- purpose: INVESTMENT or END_USE
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS
- wantsVisit: true if user wants to schedule a site visit

CRITICAL RULE: NEVER GUESS, INFER, OR ASSUME ANY VALUE. If a field is not mentioned, OMIT it completely.
- "ghar", "flat", "makan" → APARTMENT
- "zameen", "plot" → PLOT
- "shop", "commercial shop", "office" → COMMERCIAL
- "invest karna hai", "invest" → INVESTMENT
- "rehna hai", "khud ke liye" → END_USE
- "15 din", "jaldi", "turant" → ONE_MONTH
- "2 mahine", "teen mahine" → THREE_MONTHS
- "6 mahine" → SIX_MONTHS
- "baad mein", "flexible" → MORE_THAN_SIX_MONTHS
- For wantsVisit: "haan", "ready hu", "taiyar hai", "yes", "ok" → true

Return ONLY valid JSON, no explanation.
`;

// ========== Extract Lead Data (no history) ==========
export const extractLeadData = async (
  userMessage: string,
  _conversationHistory: { role: string; content: string }[] // ignored now
): Promise<ExtractedLeadData> => {
  if (!openai) {
    logger.warn("⚠️ OpenAI not configured — skipping extraction");
    return {};
  }

  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user", content: userMessage }, // only current message
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

// ========== Generate Bot Reply (strict domain guard) ==========
export const generateReply = async (
  missingFields: string[],
  leadData: ExtractedLeadData,
  _conversationHistory: { role: string; content: string }[]
): Promise<string> => {
  if (!openai) {
    return getDefaultReply(missingFields);
  }

  try {
    const systemPrompt = `
You are a strict real estate assistant. You ONLY discuss properties (apartments, villas, plots, commercial shops) in Ranchi.

Current lead data: ${JSON.stringify(leadData, null, 2)}
Missing info: ${missingFields.join(", ")}

HARD RULES:
1. DOMAIN: If the user asks about weather, sports, politics, jokes, or anything not related to property, reply EXACTLY: "Main sirf property related madad kar sakta hoon. Kya aap Ranchi mein koi property dekhna chahenge?" Never answer off-topic.
2. LANGUAGE: Mirror user's language (Hinglish, Hindi, English).
3. NO ASSUMPTIONS: Only use lead data values if user explicitly mentioned them. Never guess.
4. PROACTIVE: Ask for max 2 missing fields at a time. End every reply with a question.
5. TONE: Polite, professional, friendly. Use "Sir/Ma'am" or "ji". Never rude.
6. COMPLETION: Only offer site visit when ALL fields are present.
`;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      // we can include the last user message for context, but not full history
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 200,
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

// ========== Default Reply (unchanged) ==========
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