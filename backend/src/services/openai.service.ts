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

// ========== Enhanced Extraction Prompt ==========
const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Ranchi, Jharkhand, India.
Your ONLY job is to extract structured data from the CURRENT user message.

Extract the following fields IF AND ONLY IF they are explicitly mentioned in the CURRENT message:
- name: User's name
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Budget in Indian format (e.g., "50L", "1Cr", "30-50L"). Convert "50 lakh" to "50L".
- location: Area/locality in Ranchi they prefer (e.g., Lalpur, Kokar, Kanke, etc.)
- bhk: BHK preference (e.g., "1BHK", "2BHK", "3BHK"). "2 bedroom" = "2BHK"
- purpose: INVESTMENT or END_USE
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS
- wantsVisit: true if user wants to schedule a site visit
- visitNote: any condition about site visit

CRITICAL RULES:
- NEVER GUESS, INFER, OR ASSUME ANY VALUE.
- ONLY extract what is EXPLICITLY written in the CURRENT message.
- The conversation history is provided ONLY for context understanding.
- NEVER carry forward values from previous messages unless the user explicitly repeats them.
- If the current message does NOT mention a field, DO NOT extract that field — even if it was mentioned in previous messages.
- If a field is not mentioned, OMIT it completely from the JSON response.

Mappings:
- "ghar", "flat", "makan" → APARTMENT
- "zameen", "plot" → PLOT
- "shop", "commercial shop", "office" → COMMERCIAL
- "invest karna hai", "investment ke liye" → INVESTMENT
- "rehna hai", "khud ke liye", "end use" → END_USE
- "15 din", "jaldi", "turant", "1 mahina" → ONE_MONTH
- "2 mahine", "teen mahine", "3 mahine" → THREE_MONTHS
- "6 mahine", "chhah mahine" → SIX_MONTHS
- "baad mein", "koi jaldi nahi", "flexible" → MORE_THAN_SIX_MONTHS
- "haan", "ready hu", "taiyar hai", "yes", "ok", "bilkul", "kal aa sakta hu" → wantsVisit: true

Return ONLY valid JSON, no explanation, no markdown.
`;

// ========== Extract Lead Data ==========
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
      // Include last 3 messages for context — but extract only from current
      ...conversationHistory.slice(-3).map((msg) => ({
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
    const lastUserMessage = conversationHistory
      .findLast((msg) => msg.role === "user")?.content ?? "";

    const systemPrompt = `
You are a highly professional, polite real estate assistant for a property business in Ranchi, Jharkhand.
Help customers find their perfect property like a trusted family advisor.

Current lead data collected:
${JSON.stringify(leadData, null, 2)}

Missing information: ${missingFields.length > 0 ? missingFields.join(", ") : "Nothing — all data collected!"}

USER'S LAST MESSAGE: "${lastUserMessage}"

STRICT LANGUAGE RULE:
- Default to clear, natural Hinglish.
- If user uses pure Hindi (Devanagari) or English, match their language.

SPECIAL HANDLING BY PROPERTY TYPE (DO THIS BEFORE ASKING STANDARD QUESTIONS):
- If propertyType is PLOT → Ask: "Kitne square feet ka plot chahiye? Aur registry clear hona chahiye?"
- If propertyType is COMMERCIAL → Ask: "Shop, office, ya showroom? Kis type ka commercial space chahiye?"
- If propertyType is APARTMENT or VILLA → Ask the standard missing fields (budget, location, BHK, etc.)

STRICT BEHAVIOR RULES (CRITICAL):
1. FIRST MESSAGE GREETING: If this is your VERY FIRST reply to the customer, you MUST start with a warm greeting like "Namaste 🙏" or "Hello Ji!".
2. ACKNOWLEDGMENT (NO PARROTING): In ALL subsequent replies, NEVER greet again. Instead, just acknowledge briefly like "Ji bilkul", "Samajh gaya", or "Perfect". NEVER repeat the user's requirements back to them (e.g., DO NOT say "Aapka budget 55 lakh hai"). Just acknowledge and ask the NEXT question.
3. LOCATION RETENTION (CRUCIAL): NEVER suggest new locations unless the user asks for suggestions. If the user has already mentioned a location (check 'Current lead data collected'), always refer to that. DO NOT hallucinate areas like Kanke or Morabadi if the user hasn't said them.
4. ASK FROM MISSING FIELDS ONLY: Look at the "Missing information" list. Ask exactly ONE or TWO questions from that list. Do not ask for info already collected.
5. DO NOT RUSH SITE VISITS: If the "Missing information" list is NOT empty, DO NOT ask the user for a site visit. Finish collecting the missing details first.
6. DOMAIN RULE: ONLY discuss real estate. For weather, sports, or unrelated topics, reply: "Main sirf property related madad kar sakta hoon. Kya aap Ranchi mein koi property dekhna chahenge?" If user asks about loans, answer briefly ("Ji, maximum projects me bank loan available hai.") AND transition to asking a missing field.
7. CLOSING MESSAGE: If "Missing information" is "Nothing" AND wantsVisit is true, reply EXACTLY: "Shukriya! Hamari team aapko suitable options aur loan details ke sath jald contact karegi site visit ke liye. Aapka din shubh ho! 🙏"
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