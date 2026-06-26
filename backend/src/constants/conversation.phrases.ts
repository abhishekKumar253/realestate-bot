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
