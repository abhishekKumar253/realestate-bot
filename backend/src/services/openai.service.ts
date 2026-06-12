import OpenAI from "openai";
import { env } from "../config/index";
import logger from "../utils/logger";
import { PropertyType, Purpose, Timeline } from "@prisma/client";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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
  amenities?: string;
  possession?: string;
  loanStatus?: string;
  siteVisitDay?: string;
  siteVisitTime?: string;
  otherPropertyTypes?: string;
  minBudget?: number;
  maxBudget?: number;
}

// ========== Extraction Prompt (unchanged, works perfectly) ==========
const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Ranchi, Jharkhand, India.
Your ONLY job is to extract structured data from the CURRENT user message.

Extract the following fields IF AND ONLY IF they are explicitly mentioned in the CURRENT message:

- name: User's real full name. Do NOT extract greetings as a name.
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Indian format (e.g., "50L", "1Cr", "30-50L"). Convert "50 lakh" to "50L".
- location: Area/locality in Ranchi.
- bhk: e.g., "1BHK", "2BHK", "3BHK". "2 bedroom" = "2BHK"
- purpose: INVESTMENT or END_USE. (investment keywords → INVESTMENT, family/self → END_USE)
- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS. Map "2-3 months" → THREE_MONTHS, etc.
- wantsVisit: true if user wants to schedule a site visit
- visitNote: any condition about site visit
- amenities: comma separated list (lift, parking, gated society, etc.)
- possession: READY_TO_MOVE or UNDER_CONSTRUCTION
- loanStatus: PRE_APPROVED, APPLIED, NONE (with mappings for common phrases)
- siteVisitDay, siteVisitTime, otherPropertyTypes
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

// ========== Helper – calls OpenAI with a built prompt and returns the reply ==========
const callOpenAI = async (
  systemPrompt: string,
  conversationHistory: { role: string; content: string }[],
  fallback: string
): Promise<string> => {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ],
    max_tokens: 350,
    temperature: 0.5,
  });
  const reply = response.choices[0]?.message?.content;
  return reply || fallback;
};

// ========== Generate Reply – Language‑Aware, Natural, Human‑like ==========
export const generateReply = async (
  missingFields: string[],
  leadData: ExtractedLeadData,
  conversationHistory: { role: string; content: string }[],
  builderSystemPrompt?: string | null,
  userLanguage?: "hindi" | "english" | "hinglish"
): Promise<string> => {
  try {
    const lastUserMessage =
      [...conversationHistory].reverse().find((msg) => msg.role === "user")
        ?.content ?? "";

    const leadDataStr = JSON.stringify(leadData, null, 2);
    const missingFieldsStr =
      missingFields.length > 0 ? missingFields.join(", ") : "None";

    // ----- ENGLISH PROMPT -----
    if (userLanguage === "english") {
      const prompt = `
You are a professional real estate assistant for builders in Ranchi, India.
Your job: ask questions to qualify a property lead.

IMPORTANT: Respond exclusively in English. Use only English words, no Hindi or Hinglish.

Personality: Warm, helpful, natural. Use emojis occasionally (🏠📍💰✅🙏😊).

Current lead data: ${leadDataStr}
Missing fields: ${missingFieldsStr}
User's last message: "${lastUserMessage}"

Rules:
1. FIRST MESSAGE ONLY: Greet warmly with name if available. Example: "Hello Abhishek! What type of property are you looking for — apartment, villa, plot, or commercial?"
2. Do NOT repeat what the user just said. Acknowledge briefly and ask the next missing question.
3. Ask only ONE question at a time, in this order:
   - property type → BHK → location → budget → timeline
4. After timeline is collected, close with: "Thank you for your requirements. Our team will contact you shortly to arrange a site visit. Have a great day! 😊"
5. If user is rude or off‑topic: "I'm sorry, I can only help with property inquiries. Please tell me your property requirements."
6. Keep replies short, friendly, and professional.
`;
      const systemMsg = builderSystemPrompt
        ? `${prompt}\n\nBuilder notes: ${builderSystemPrompt}`
        : prompt;
      return callOpenAI(
        systemMsg,
        conversationHistory,
        getDefaultReply(missingFields, "english")
      );
    }

    // ----- HINDI PROMPT -----
    if (userLanguage === "hindi") {
      const prompt = `
आप रांची, झारखंड के रियल एस्टेट बिल्डर्स के लिए एक सहायक हैं।
केवल शुद्ध हिंदी में देवनागरी लिपि में उत्तर दें। लैटिन अक्षर नहीं।

व्यक्तित्व: गर्मजोशी भरे, सहायक, प्राकृतिक। (उदाहरण: "नमस्ते अभिषेक जी! 🙏")

वर्तमान डेटा: ${leadDataStr}
गुम जानकारी: ${missingFieldsStr}
उपयोगकर्ता का अंतिम संदेश: "${lastUserMessage}"

नियम:
1. केवल पहले संदेश में नमस्ते करें।
2. हर बार केवल एक प्रश्न पूछें, इस क्रम में: प्रॉपर्टी प्रकार → बीएचके → स्थान → बजट → समयसीमा
3. सब जानकारी मिलने पर बंद करें: "आपकी जानकारी मिल गई। हमारी टीम शीघ्र ही साइट विजिट के लिए संपर्क करेगी।"
4. असंबंधित प्रश्न पर: "मैं केवल प्रॉपर्टी में मदद कर सकता हूँ।"
`;
      const systemMsg = builderSystemPrompt
        ? `${prompt}\n\nबिल्डर के निर्देश: ${builderSystemPrompt}`
        : prompt;
      return callOpenAI(
        systemMsg,
        conversationHistory,
        getDefaultReply(missingFields, "hindi")
      );
    }

    // ----- HINGLISH PROMPT (default) -----
    const prompt = `
Aap Ranchi ke real estate assistant hain. Hinglish mein baat karein (Latin script, mix Hindi+English).
User ko warm, natural, human-like lagna chahiye.

Current lead data: ${leadDataStr}
Missing fields: ${missingFieldsStr}
User's last message: "${lastUserMessage}"

Rules:
1. FIRST MESSAGE ONLY: Greet with "Namaste [name] ji! 🙏" then ask first question.
2. NO repeating user's words — just acknowledge (Samjha! / Achha!) and ask next missing field.
3. Ask only ONE question at a time in this order: propertyType → bhk → location → budget → timeline.
4. After timeline collected, close with: "Shukriya [name] ji! 🙏 Saari details mil gayi. Hamari team jald hi aapse site visit arrange karne ke liye contact karegi."
5. Use emojis naturally (🏠📍💰✅🙏😊).
6. If user is rude: "Maaf kijiye, main sirf property mein madad kar sakta hoon."
7. Keep replies short, friendly, never robotic.
`;
    const systemMsg = builderSystemPrompt
      ? `${prompt}\n\nBuilder ke notes: ${builderSystemPrompt}`
      : prompt;
    return callOpenAI(
      systemMsg,
      conversationHistory,
      getDefaultReply(missingFields, "hinglish")
    );
  } catch (error) {
    logger.error({ error }, "❌ Failed to generate reply");
    return getDefaultReply(missingFields, userLanguage);
  }
};

// ========== Default reply (language‑aware) ==========
const getDefaultReply = (
  missingFields: string[],
  userLanguage?: string
): string => {
  const isEnglish = userLanguage === "english";
  const fieldMessages: Record<string, string> = {
    propertyType: isEnglish
      ? "What type of property are you looking for — apartment, villa, plot, or commercial?"
      : "Aap flat, plot, villa ya commercial me kya dekh rahe hain? 🏠",
    budget: isEnglish
      ? "What is your approximate budget?"
      : "Approx budget kya rahega? 💰",
    location: isEnglish
      ? "Which area do you prefer?"
      : "Kaunsa area prefer karenge? 📍",
    bhk: isEnglish ? "How many BHK do you need?" : "Kitne BHK chahiye?",
    timeline: isEnglish
      ? "When do you plan to finalize?"
      : "Kab tak finalize karna chahte hain? 📅",
  };
  const field = missingFields[0];
  if (field && fieldMessages[field]) return fieldMessages[field];
  return isEnglish
    ? "Please share your property requirements."
    : "Koi aur detail batani ho toh bata dijiye. 😊";
};
