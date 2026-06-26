import type { LanguagePref } from "../types/langgraph.types";

// ─── Opt-out phrases (user wants to stop messages) ─────────────────────────
export const OPT_OUT_PHRASES = [
  // English
  "stop",
  "unsubscribe",
  "cancel",
  "quit",
  "exit",
  "opt out",
  "opt-out",
  "remove me",
  "no more messages",
  "don't contact",
  "dont contact",
  "block",
  // Hindi
  "band karo",
  "mat bhejo",
  "nahi chahiye",
  "rokna hai",
  "hatao",
  "band kar do",
  "mat karo",
  "rokna",
  "band kar",
  // Hinglish
  "stop karo",
  "message mat karo",
  "nahi chahiye message",
  "mat send karo",
  // Telugu
  "aapandi",
  "vaddhu",
  "pampinchakandi",
  "nilipinchandi",
  // Tamil
  "niruthu",
  "vendam",
  "anuppadhey",
] as const;

// ─── Human handoff phrases (user wants to talk to a real person) ────────────
export const HUMAN_HANDOFF_PHRASES = [
  // English
  "talk to human",
  "speak to agent",
  "real person",
  "connect me to agent",
  "human please",
  "customer care",
  "manager",
  "speak to someone",
  // Hindi
  "insaan se baat",
  "agent se baat",
  "kisi se baat karni hai",
  "manager se baat",
  "real banda chahiye",
  // Hinglish
  "human se baat karo",
  "agent chahiye",
  "real person chahiye",
  // Telugu
  "manishitho matladaali",
  "agent kavali",
] as const;

// ─── Casual greetings (short messages → Hinglish detection) ─────────────────
export const CASUAL_GREETINGS = new Set([
  "hi",
  "hello",
  "hey",
  "hii",
  "hiii",
  "yo",
  "hm",
  "bolo",
  "haan",
]);

// ─── Hinglish vocabulary markers ────────────────────────────────────────────
export const HINGLISH_WORDS = new Set([
  "chaiye",
  "chahiye",
  "dena",
  "dedo",
  "bhai",
  "bro",
  "kitna",
  "kitne",
  "kahan",
  "kidhar",
  "kaunsa",
  "kaunsi",
  "dikha",
  "dikhaiye",
  "batao",
  "batana",
  "karna",
  "rehna",
  "rakhna",
  "lakh",
  "crore",
  "rupees",
  "sqft",
  "carpet",
  "possession",
  "rera",
  "down",
  "payment",
  "booking",
  "confirm",
  "site",
  "visit",
]);

// ─── Rude / frustration words (force Hinglish reply) ─────────────────────────
export const RUDE_WORDS = new Set([
  "shut up",
  "stupid",
  "bakwas",
  "bakwaas",
  "chup",
  "hat",
  "nalayak",
  "idiot",
  "dumb",
  "mad",
  "fuck",
  "what the",
  "what is this",
]);

export const FALLBACK_REPLIES: Record<LanguagePref, string> = {
  english: "Please share your property requirements.",
  hindi: "कृपया अपनी प्रॉपर्टी की जानकारी साझा करें।",
  hinglish: "Koi property detail batani ho toh bata dijiye. 😊",
  telugu: "దయచేసి మీ ప్రాపర్టీ అవసరాలను పంచుకోండి。",
  tamil: "தயவுசெய்து உங்கள் சொத்து தேவைகளைப் பகிர்ந்து கொள்ளுங்கள்.",
};

export const VALIDATION_FALLBACKS = {
  policyViolation: {
    english:
      "I'd be happy to help you with your property requirements. Could you please share more details?",
    hinglish:
      "Main aapki property requirements mein help kar sakta hoon. Thoda aur detail batayein?",
    hindi:
      "Main aapki property requirements mein madad kar sakta hoon. Kripaya thoda aur detail batayein.",
    telugu:
      "Nenu mee property avasaraalaku sahayam cheyagalanu. Konni visheshalu cheppagalara?",
    tamil:
      "Naan ungaludan aathu thevaiyil ungaluku uthavugalaen. Konja vivarangalai solli thara mudiyuma?",
  },
  empty: {
    english:
      "I apologize, I didn't understand that. Could you please rephrase?",
    hinglish: "Maaf kijiye, samajh nahi aaya. Thoda alag tareeke se bataiye?",
    hindi: "Kshama karen, samajh nahi aaya. Kripaya dobara batayein?",
    telugu: "Kshaminchandi, ardham kaledu. Malli cheppagalara?",
    tamil: "Mannikkavum, puriyavillai. Marupadiyum solli thara mudiyuma?",
  },
  error: {
    english:
      "I apologize, I'm experiencing technical difficulties. Please try again shortly.",
  },
} as const;