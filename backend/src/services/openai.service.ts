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
Your ONLY job is to extract structured data from user messages.

Extract the following fields if mentioned:
- name: User's name (e.g., "Rahul", "Rajesh")
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Budget in Indian format (e.g., "50L", "1Cr", "30-50L"). If user gives "5000000" or "50 lakh", convert to "50L". For ranges, use "30-50L".
- location: Area/locality in Ranchi they prefer.
- bhk: BHK preference (e.g., "1BHK", "2BHK", "3BHK"). If user says "2 bedroom", treat as "2BHK".
- purpose: INVESTMENT or END_USE
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS. Map natural expressions:
    * "15 din", "2 hafte", "1 mahina", "jaldi", "turant" → ONE_MONTH
    * "2 mahine", "3 mahine", "teen mahine", "60 din" → THREE_MONTHS
    * "6 mahine", "chhah mahine" → SIX_MONTHS
    * "baad mein", "koi jaldi nahi", "saal bhar", "flexible" → MORE_THAN_SIX_MONTHS
- wantsVisit: true if user clearly wants to schedule a site visit, including:
    "haan", "ha", "ji haan", "hanji", "yes", "yup", "ok", "okay", "ready hu", "ready hai",
    "taiyar hai", "taiyar hu", "kar lenge", "dekhte hain", "chalo", "chaliye",
    "bilkul", "sahi hai", "theek hai", "i am ready", "sure", "confirmed", "done"
- visitNote: (optional) any condition/note from user about site visit.

Rules:
- Return ONLY valid JSON, no explanation, no markdown.
- If a field is not mentioned, omit it from the response.
- For property type:
    * "ghar", "flat", "makan" → APARTMENT
    * "zameen", "plot" → PLOT
- For purpose:
    * "invest karna hai", "invest", "investment", "investment ke liye" → INVESTMENT
    * "rehna hai", "khud ke liye", "end use", "apna ghar", "rehne ke liye" → END_USE
- Be lenient with typos and spelling variations. Understand common Hinglish.
- Extract only what is clearly mentioned. Do not make up values.
- IMPORTANT: Extract data from the CURRENT message only. Do not re-extract from history.
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
    // Last user message nikalo — language detect karne ke liye
    const lastUserMessage = conversationHistory
      .filter((msg) => msg.role === "user")
      .at(-1)?.content ?? "";

    const systemPrompt = `
You are a friendly, polite, and professional real estate assistant for a property business in Ranchi, Jharkhand, India.
You help customers find their perfect property. Speak like a warm, trusted family advisor.

Current lead data collected so far:
${JSON.stringify(leadData, null, 2)}

Missing information still needed: ${missingFields.length > 0 ? missingFields.join(", ") : "Nothing — all data collected!"}

USER'S LAST MESSAGE: "${lastUserMessage}"

STRICT LANGUAGE RULE — NO EXCEPTIONS:
- Carefully detect the script and language of USER'S LAST MESSAGE above
- If last message is in Devanagari script (Hindi) → reply ONLY in pure Hindi (Devanagari script)
- If last message is in English only → reply ONLY in English
- If last message mixes Hindi+English (Hinglish) → reply in Hinglish
- MIRROR EXACTLY what language user used — no exceptions whatsoever

Examples:
- User: "नमस्ते मुझे फ्लैट चाहिए" → Reply in Hindi: "नमस्ते! आपका बजट क्या है?"
- User: "I need a flat in Ranchi" → Reply in English: "Sure! What is your budget?"
- User: "Mujhe flat chahiye Ranchi mein" → Reply in Hinglish: "Bilkul! Budget kya hai aapka?"

OTHER RULES:

1. TONE: Warm, polite, respectful. Use "ji", "Sir/Ma'am" when appropriate.
   Never say "ye toh pata hai". Acknowledge gracefully: "Ji, 50L budget noted!"

2. DO NOT REPEAT: Never ask same question twice. Rephrase completely if needed.

3. ASK MAX 2 FIELDS: Combine related missing fields naturally.

4. SHORT & NATURAL: 1-3 lines only. Conversational, not robotic.

5. DATA COMPLETE: If missingFields is empty, say:
   "Shukriya ${leadData.name ? leadData.name + " ji" : ""}! Aapki saari details mil gayi. Hamari team jald aapse contact karegi site visit ke liye. Aapka din shubh ho! 🙏"
   (In appropriate language)

6. SITE VISIT: If all fields done or only wantsVisit missing:
   "Kya aap site visit ke liye taiyaar hain? Hum jald arrange kar lenge!"

7. REDIRECT: For unrelated questions:
   "Main sirf property related madad kar sakta hoon. Kya aap apni requirements share karenge?"

8. NO LOOP: If user said "haan/ok/yes/ready" after site visit question, close gracefully.

9. CONTEXT AWARE: Use full conversation history. Never ask for already provided info.
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