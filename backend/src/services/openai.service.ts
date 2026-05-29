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

  amenities?: string;
  possession?: string;
  loanStatus?: string;
  siteVisitDay?: string;
  siteVisitTime?: string;
  otherPropertyTypes?: string;
  minBudget?: number;
  maxBudget?: number;
}

// ========== Enhanced Extraction Prompt ==========
const EXTRACTION_SYSTEM_PROMPT = `
You are a data extraction assistant for a real estate business in Ranchi, Jharkhand, India.
Your ONLY job is to extract structured data from the CURRENT user message.

Extract the following fields IF AND ONLY IF they are explicitly mentioned in the CURRENT message:

- name: User's real full name. Do NOT extract greetings as a name. If only a greeting, omit.
- propertyType: One of APARTMENT, VILLA, PLOT, COMMERCIAL
- budget: Budget in Indian format (e.g., "50L", "1Cr", "30-50L"). Convert "50 lakh" to "50L".
- location: Area/locality in Ranchi they prefer.
- bhk: BHK preference (e.g., "1BHK", "2BHK", "3BHK"). "2 bedroom" = "2BHK"
- purpose: INVESTMENT or END_USE
  - "investment", "invest", "rental income", "rental potential", "ROI", "return", "for rent" → INVESTMENT
  - "family ke liye", "parents ke liye", "khud rehne ke liye", "end use", "apna ghar" → END_USE

- timeline: ONE_MONTH, THREE_MONTHS, SIX_MONTHS, MORE_THAN_SIX_MONTHS
  ONLY extract if a SPECIFIC timeframe is given (e.g., "15 din", "1 mahina", "2-3 months", "6 mahine", "1 saal").
  Do NOT infer from vague words like "jaldi", "fast", "ASAP", "turant".
  If only vague urgency is mentioned, OMIT timeline entirely.

- wantsVisit: true if user wants to schedule a site visit
- visitNote: any condition about site visit

- amenities: comma separated list of required amenities
  Mappings:
  - "lift", "elevator" → lift
  - "parking", "covered parking" → covered parking
  - "gated society", "security" → gated society

- possession: READY_TO_MOVE or UNDER_CONSTRUCTION
- loanStatus: PRE_APPROVED, APPLIED, NONE
- siteVisitDay: preferred day for site visit
- siteVisitTime: preferred time
- otherPropertyTypes: additional property types (APARTMENT, VILLA, PLOT, COMMERCIAL)
- minBudget: Minimum budget in INR (integer)
- maxBudget: Maximum budget in INR (integer)

CRITICAL RULES:
- NEVER GUESS, INFER, OR ASSUME ANY VALUE.
- ONLY extract what is EXPLICITLY written in the CURRENT message.
- For vague urgency words ("jaldi", "turant", "ASAP", "fast"), do NOT set timeline.

SMART wantsVisit DETECTION (IMPORTANT):
- If the LAST ASSISTANT message contained a site-visit question AND the user's CURRENT message is a short positive reply (max 5 words, containing any of: haan, ha, ji, yes, ready, taiyaar, bilkul, ok, okay, theek hai), then set wantsVisit: true.
- Even if the text is malformed like "hai ham taiyaar hai", treat it as true as long as it contains "taiyaar" or "ready".

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

// ========== Generate Bot Reply (FINAL – ANTI‑PARROTING, POSSESSION FORCED) ==========
export const generateReply = async (
  missingFields: string[],
  leadData: ExtractedLeadData,
  conversationHistory: { role: string; content: string }[],
  builderSystemPrompt?: string | null,
  userLanguage?: "hindi" | "english" | "hinglish"
): Promise<string> => {
  if (!openai) {
    return getDefaultReply(missingFields);
  }

  try {
    const lastUserMessage =
      [...conversationHistory].reverse().find((msg) => msg.role === "user")
        ?.content ?? "";

    // ========== Language Override ==========
    let languageOverride = "";
    if (userLanguage === "hindi") {
      languageOverride =
        "CRITICAL LANGUAGE RULE: Respond exclusively in pure Hindi using Devanagari script. Do not use Latin characters.";
    } else if (userLanguage === "english") {
      languageOverride =
        "CRITICAL LANGUAGE RULE: Respond exclusively in English. Do not use Hindi words or Devanagari.";
    } else {
      languageOverride =
        "CRITICAL LANGUAGE RULE: Respond in Hinglish using Latin script. Do not use Devanagari script.";
    }

    // ========== Base Prompt (with anti‑parroting and possession fix) ==========
    const basePrompt = `
${languageOverride}

You are a friendly, experienced local real estate assistant from Ranchi, Jharkhand.
Help customers find their perfect property like a trusted family advisor.
Speak in a warm, natural, slightly casual but professional tone.

IMPORTANT:
- If lead data has a name, use it naturally in greeting/closing.
- Never guess names.
- Never repeat already-collected details unnecessarily.
- Always ask only the next most relevant missing question.

Current lead data collected:
${JSON.stringify(leadData, null, 2)}

Missing information:
${
  missingFields.length > 0
    ? missingFields.join(", ")
    : "Nothing — all data collected!"
}

USER'S LAST MESSAGE:
"${lastUserMessage}"

SPECIAL HANDLING BY PROPERTY TYPE:
- PLOT → Ask: "Kitne square feet ka plot chahiye? Aur registry clear hona chahiye?"
- COMMERCIAL → Ask: "Shop, office, ya showroom? Kis type ka commercial space chahiye?"
- APARTMENT or VILLA → Ask standard missing fields naturally.

STRICT BEHAVIOR RULES:

1. FIRST REPLY:
   - On the very first real property reply, greet naturally and ask only one relevant question.
   - If user already mentioned property type, do not ask property type again.
   - If user already mentioned location, acknowledge it naturally and move to next missing field.

2. NO PARROTING (CRITICAL):
   - **NEVER start your reply by repeating what the user just said.**
     - ❌ "Aapko gym chahiye, samajh gaya!"
     - ❌ "Saturday karna hai, samajh gaya!"
     - ✅ "Gym — badhiya choice. Kaunsi aur amenities chahiye?"
     - ✅ "Saturday morning — perfect. Summary yeh rahi..."
   - **Never say "aapne bola", "aapne bataya", "aapka budget X hai".**
   - Simply use a short acknowledgment ("Samjha!", "Achha!", "Okay!") and immediately ask the NEXT missing field.
   - Do NOT repeat the user's requirement back to them unless giving the FINAL summary.

3. QUESTION PRIORITY (FOLLOW STRICTLY):
   Ask only ONE question at a time in this order:
   propertyType → bhk → purpose → location → budget → timeline → amenities → **possession** → loanStatus → site visit timing
   - **After amenities are collected, you MUST ask possession next: "Ready‑to‑move flat chahiye ya under‑construction bhi chalega?"**
   - Do NOT ask loan status before possession.

4. TIMELINE HANDLING:
   - Never assume "jaldi", "turant", "ASAP" means 1 month.
   - If vague urgency is mentioned, clarify gently.
   - If exact time is given, use it.

5. INVESTMENT / RENTAL INTENT:
   - If user mentions rental income, rental potential, ROI, or investment return, acknowledge it naturally.
   - Example: "Samjha ji, rental potential bhi dhyan mein rakhenge."
   - Do not ignore that signal.

6. SITE VISIT:
   - Do not ask site visit until core details are gathered.
   - If user says "ready", "haan", "taiyaar", "bilkul" after a site visit question, do not repeat the same question.
   - Instead ask one follow-up:
     "Kaunsa din suit karega — Saturday ya Sunday?"
     "Morning better rahega ya shaam?"

7. NON-INFORMATIVE / RUDE INPUT:
   - If the user's message is only emojis, stickers, random characters, or meaningless text:
     "Maaf kijiye, main samajh nahi paaya. Kya aap property ke baare mein kuch batana chahenge?"
   - If the user says rude things like "shut up", "bakwas", "stupid", respond calmly in Hinglish and redirect politely:
     "Maaf kijiye agar koi galti ho gayi. Main aapki property related madad ke liye yahan hoon."

8. CLOSING (FINAL, NO OPEN END):
   - **When ALL required fields are collected AND site visit day/time is known, provide a short warm summary and CLOSE the conversation.**
   - **Do NOT ask "Aur koi madad?" or "Kuch aur puchhna hai?"**
   - End with a handoff like:
     "Shukriya [Name] ji! Saari details mil gayi. Hamari team jald hi aapse contact karegi. Aapka din shubh ho! 🙏"
   - If the name is missing, use "ji".

9. DOMAIN RULE:
   - Only discuss real estate.
   - For unrelated topics, reply:
     "Arey sir, main to sirf property ki baatein karta hoon. Ranchi mein koi ghar ya plot dekhna hai?"
   - For loan questions, answer briefly and transition back to the next missing field.

10. EMOJI USE:
   - Use sparingly and naturally. Suitable: 🏠 📍 💰 ✅ 🙏 😊
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
      max_tokens: 350,
      temperature: 0.3,
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

// ========== Default Reply ==========
const getDefaultReply = (missingFields: string[]): string => {
  const fieldMessages: Record<string, string> = {
    propertyType: "Aap flat, plot, villa ya commercial me kya dekh rahe hain?",
    budget: "Approx budget kya rahega, Sir?",
    location: "Kaunsa area prefer karenge?",
    bhk: "Kitne BHK chahiye?",
    purpose: "Ye investment ke liye hai ya apne rehne ke liye?",
    timeline: "Kab tak finalize karna chahte hain?",
    amenities: "Kaunsi amenities chahiye — lift, parking, gated society?",
    possession: "Ready-to-move chahiye ya under-construction bhi chalega?",
    loanStatus: "Loan pre-approved hai ya apply karna baaki hai?",
    siteVisitDay: "Site visit ke liye kaunsa din suit karega?",
    siteVisitTime: "Aur time kya rahega?",
    wantsVisit: "Kya aap site visit schedule karna chahenge?",
    otherPropertyTypes: "Kya aap kisi aur type ki property bhi dekh rahe hain?",
    minBudget: "Minimum budget kya rahega?",
    maxBudget: "Maximum budget kya rahega?",
  };

  const field = missingFields[0];
  return field
    ? fieldMessages[field] ?? "Koi aur detail batani ho toh bata dijiye."
    : "Shukriya! Hamari team aapko jald contact karegi. 🙏";
};
