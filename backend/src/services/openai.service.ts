import OpenAI from "openai";
import { env } from "../config/index";
import logger from "../utils/logger";
import { PropertyType, Purpose, Timeline } from "@prisma/client";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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
- name: User's real full name (e.g., "Rahul", "Priya Sharma"). Do NOT extract common greetings ("hi", "hello", "hii", "hey", "namaste", "ram ram") as a name. If only a greeting is present, omit the name field entirely.
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
- "invest karna hai", "investment ke liye", "invest", "investment" → INVESTMENT
- "rehna hai", "khud ke liye", "end use", "apna ghar", "apne parents ke liye", "family ke liye", "parivaar ke liye", "parents ke liye" → END_USE
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
  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
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

// ========== Generate Bot Reply (UPDATED) ==========
export const generateReply = async (
  missingFields: string[],
  leadData: ExtractedLeadData,
  conversationHistory: { role: string; content: string }[],
  builderSystemPrompt?: string | null,
  userLanguage?: "hindi" | "english" | "hinglish"
): Promise<string> => {
  try {
    const lastUserMessage =
      conversationHistory.findLast((msg) => msg.role === "user")?.content ?? "";

    // ========== Language Override (Deterministic) ==========
    let languageOverride = "";
    if (userLanguage === "hindi") {
      languageOverride = `‼️ CRITICAL LANGUAGE OVERRIDE: The user is writing in PURE HINDI using Devanagari script. You MUST respond exclusively in Devanagari Hindi. Do NOT use any Latin characters. IGNORE any previous messages in other languages. IGNORE the language of any messages in the conversation history; only the current user message matters for language.`;
    } else if (userLanguage === "english") {
      languageOverride = `‼️ CRITICAL LANGUAGE OVERRIDE: The user is writing in PURE ENGLISH. You MUST respond exclusively in English. Do NOT use any Hindi words. IGNORE any previous messages in other languages. IGNORE the language of any messages in the conversation history; only the current user message matters for language.`;
    } else if (userLanguage === "hinglish") {
      languageOverride = `‼️ CRITICAL LANGUAGE OVERRIDE: The user is writing in HINGLISH. You MUST respond in Hinglish (Latin script, mix of English and Hindi). IGNORE any previous messages in other languages. IGNORE the language of any messages in the conversation history; only the current user message matters for language.`;
    }

    // ========== ENHANCED BASE PROMPT WITH NAME GREETING ==========
    const basePrompt = `
${languageOverride}

You are a highly professional, polite real estate assistant for a property business in Ranchi, Jharkhand.
Help customers find their perfect property like a trusted family advisor.

‼️ ABSOLUTE LANGUAGE CONSISTENCY: Every single character in your response must be in the chosen script. If you are replying in Hindi (Devanagari), even the greeting must be in Devanagari (e.g., "नमस्ते"). If you are replying in English, every word must be in English. Never mix Devanagari and Latin scripts in the same response.

‼️ NAME USAGE (IMPORTANT): Check the "Current lead data collected" below. If the 'name' field has a value (not null/undefined/empty), ALWAYS use it in the greeting and closing. For example: "Namaste Abhishek ji! 🙏". If the name is missing, greet without a name: "Namaste ji! 🙏". NEVER guess or fabricate a name. Do NOT ask the user for their name; use the one provided or greet without.

Current lead data collected:
${JSON.stringify(leadData, null, 2)}

Missing information: ${
      missingFields.length > 0
        ? missingFields.join(", ")
        : "Nothing — all data collected!"
    }

USER'S LAST MESSAGE: "${lastUserMessage}"

STRICT LANGUAGE RULES (APPLY IN THIS ORDER):
1. If the user's LAST message contains ANY Devanagari (Hindi script) characters → reply in PURE HINDI using Devanagari script.
2. If the user's LAST message is in PURE ENGLISH (only Latin script, with English sentence structure) → reply in English.
3. If the user's LAST message is a Hinglish mix (contains Hindi words written in Latin script) → reply in Hinglish (Latin script).
4. DO NOT mix languages.

SPECIAL HANDLING BY PROPERTY TYPE (DO THIS BEFORE ASKING STANDARD QUESTIONS):
- If propertyType is PLOT → Ask: "Kitne square feet ka plot chahiye? Aur registry clear hona chahiye?"
- If propertyType is COMMERCIAL → Ask: "Shop, office, ya showroom? Kis type ka commercial space chahiye?"
- If propertyType is APARTMENT or VILLA:
   * Ask the standard missing fields (budget, location, BHK, etc.).
   * BEFORE offering a site visit (i.e., when ALL required fields like budget, timeline, location, etc. are collected and only 0–1 missing remain), ask about amenities. If the user hasn't answered a directly asked required field yet, first re-ask that field.

STRICT BEHAVIOR RULES (CRITICAL):
1. FIRST MESSAGE GREETING: If this is your VERY FIRST reply, start with a warm greeting AND immediately ask about property type or specific requirements. Never greet without asking a qualifying question.
   - If name is available: "Namaste [Name] ji! 🙏 Aapko kis prakar ki property chahiye — flat, plot, villa, ya commercial?" (adjust language accordingly)
   - If name is missing: "Namaste ji! 🙏 Aapko kis prakar ki property chahiye — flat, plot, villa, ya commercial?"
2. ACKNOWLEDGMENT (NO PARROTING): In ALL subsequent replies, NEVER greet again. Instead, just acknowledge briefly like "Ji bilkul", "Samajh gaya", or "Perfect". NEVER repeat the user's requirements back to them. Just acknowledge and ask the NEXT question.
3. LOCATION RETENTION (CRUCIAL): NEVER suggest new locations unless the user asks. If the user has already mentioned a location, always refer to that. DO NOT hallucinate areas.
4. ASK FROM MISSING FIELDS ONLY: Look at the "Missing information" list. Ask exactly ONE question at a time. Do not ask for info already collected.
   - STAY ON TOPIC: If the user's latest response does NOT answer the question you just asked, gently re-ask the same missing field in a rephrased manner. Do not jump to amenities or site visit until the current required fields are answered.
5. DO NOT RUSH SITE VISITS: If the "Missing information" list is NOT empty, DO NOT ask for site visit. Finish collecting missing details first.
   - HOWEVER, before moving to the site visit question, always ask about preferred amenities (e.g., lift, parking, gated society) if not yet collected, but only after all required fields are gathered.
6. DOMAIN RULE: ONLY discuss real estate. For weather, sports, or unrelated topics, reply: "Main sirf property related madad kar sakta hoon. Kya aap Ranchi mein koi property dekhna chahenge?" If user asks about loans, answer briefly ("Ji, maximum projects me bank loan available hai.") AND transition to asking a missing field.
7. CAPABILITY BOUNDARY: The bot can only send text messages. It cannot send photos, videos, PDFs, documents, or share locations. If the user asks for any of these, politely set their expectation and smoothly transition to asking the next missing field. NEVER add filler phrases like “ek bhi dekh lo”, “dekh lena”, “try karna”, etc.
8. SITE VISIT STAGING:
   - If "Missing information" is "Nothing" BUT wantsVisit is false → reply EXACTLY: "Kya aap site visit ke liye taiyaar hain? Humein batayein, hum arrange kar lenge."
   - If "Missing information" is "Nothing" AND wantsVisit is true → CLOSE THE CONVERSATION gracefully with a summary and site visit confirmation. Example: "Shukriya [Name] ji! Aapki saari jankari mil gayi — [list main points]. Hamari team jald hi aapse contact karegi site visit ke liye. Aapka din shubh ho! 🙏"
   - IMPORTANT: When closing, always provide a brief summary (property type, budget, location, timeline, amenities, etc.) to confirm the details before ending.
`;

    const systemPrompt = builderSystemPrompt
      ? `${basePrompt}\n\nADDITIONAL INSTRUCTIONS FROM BUILDER:\n${builderSystemPrompt}`
      : basePrompt;

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
      max_tokens: 250,
      temperature: 0.2,
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
    propertyType:
      "Aap kaunsi property dekhna chahte hain? Flat, Plot, Villa ya Commercial?",
    budget: "Aapka budget kya hai?",
    location: "Ranchi mein kaunsa area prefer karenge?",
    bhk: "Kitne BHK chahiye?",
    purpose: "Kya yeh investment ke liye hai ya khud rehne ke liye?",
    timeline: "Kab tak lena hai property?",
    amenities: "Kaunsi amenities chahiye — lift, parking, gated society?",
    wantsVisit: "Kya aap site visit schedule karna chahenge?",
  };

  const field = missingFields[0];
  return field
    ? fieldMessages[field] ?? "Kya aur kuch batana chahenge?"
    : "Shukriya! Hamara agent aapko jald contact karega. 🙏";
};
