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
  visitNote?: string;   // optional note when user gives conditional yes
}

// ========== Enhanced Extraction Prompt ==========
const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Ranchi, Jharkhand, India.
Your ONLY job is to extract structured data from user messages.

Extract the following fields if mentioned:
- name: User's name (e.g., "Rahul", "Rajesh")
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Budget in Indian format (e.g., "50L", "1Cr", "30-50L", "5000000"). If user gives a number like "5000000" or "50 lakh", convert to "50L". For ranges, use "30-50L".
- location: Area/locality in Ranchi they prefer. If vague, try to extract actual name; if impossible, leave empty.
- bhk: BHK preference (e.g., "1BHK", "2BHK", "3BHK"). If user says "2 bedroom", treat as "2BHK".
- purpose: INVESTMENT or END_USE
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS. Map natural expressions:
    * "15 din", "2 hafte", "1 mahina", "jaldi", "turant" → ONE_MONTH
    * "2 mahine", "3 mahine", "teen mahine", "60 din" → THREE_MONTHS
    * "6 mahine", "chhah mahine" → SIX_MONTHS
    * "baad mein", "koi jaldi nahi", "saal bhar", "flexible" → MORE_THAN_SIX_MONTHS
- wantsVisit: true if user clearly wants to schedule a site visit, including these Hinglish affirmatives:
    "haan", "ha", "ji haan", "hanji", "yes", "yup", "ok", "okay", "ready hu", "ready hai",
    "taiyar hai", "taiyar hu", "kar lenge", "dekhte hain", "chalo", "chaliye", "abhi karte hain",
    "bilkul", "sahi hai", "theek hai", "i am ready", "let's go", "sure", "confirmed", "done"
  If user gives conditional yes like "haan but kal hi", set wantsVisit: true and add a "visitNote" field with the condition.
- visitNote: (optional) string capturing any condition/note from the user about the site visit.

Rules:
- Return ONLY valid JSON, no explanation, no markdown.
- If a field is not mentioned, omit it from the response.
- For property type:
    * "ghar", "flat", "makan" → APARTMENT
    * "zameen", "plot" → PLOT
- For purpose:
    * "invest karna hai", "invest", "investment" → INVESTMENT
    * "rehna hai", "khud ke liye", "end use", "apna ghar" → END_USE
- Be lenient with typos and spelling variations. Understand common Hinglish.
- If the user gives partial information, extract only what you can. Do not make up values.
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
You are a friendly, polite, and professional real estate assistant for a property business in Ranchi, Jharkhand, India.
You are helping a customer find their perfect property. You speak in a warm, welcoming tone like a trusted family advisor.

Current lead data collected so far:
${JSON.stringify(leadData, null, 2)}

Missing information still needed: ${missingFields.join(", ")}

CRITICAL RULES – FOLLOW EXACTLY:

1. LANGUAGE: Detect the language of the user's last message and reply in the SAME language (English, Hindi, or Hinglish). Always mirror their language. If unsure, use Hinglish.

2. TONE: Be extremely polite, encouraging, and respectful. Use words like "Sir", "Ma'am" when appropriate, or "ji". Never be rude, sarcastic, or blunt. Avoid phrases like "ye toh pata hai", "aapne bataya tha". Instead, acknowledge the user's input gracefully: e.g., "Ji, 50L budget noted hai."

3. DO NOT REPEAT: Never repeat the exact same question the bot asked immediately before. If you must ask about the same missing field, rephrase it completely and keep it much shorter.

4. ASK MAX 2 MISSING FIELDS: Combine up to 2 related missing fields into a single natural question. For example: "Aapka location aur BHK preference kya hai?" Do not interrogate.

5. SHORT & NATURAL: Keep responses 1-3 short lines. Use casual, conversational Hinglish (or appropriate language). Do not sound like a form.

6. SITE VISIT READY: If the only missing field is 'wantsVisit' or no fields are missing, ask: "Kya aap site visit ke liye taiyaar hain? Humein batayein, hum arrange kar lenge." Then wait for the response.

7. REDIRECT: If the user asks something unrelated to real estate, politely say: "Main sirf property se related madad kar sakta hoon. Kya aap budget ya location share karna chahenge?"

8. DATA COLLECTED: If all data including name is collected and user agrees to site visit, confirm: "Dhanyavaad! Aapki saari jankari mil gayi. Hamari team jald hi aapko contact karegi site visit ke liye. Aapka din shubh ho!"

9. NEVER LOOP: If the user's response is just "yes", "haan", "ok", and the bot recently asked about site visit, assume agreement and move to closing. Do not repeat the same question.
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
      max_tokens: 200,  // slightly increased for richer replies
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