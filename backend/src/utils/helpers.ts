import {
  WhatsAppWebhookPayload,
  IncomingMessage,
} from "../types/whatsapp.types.js";
import {
  HINGLISH_WORDS,
  CASUAL_GREETINGS,
  RUDE_WORDS,
} from "../constants/conversation.phrases.js";


// ─── WhatsApp payload extractors ─────────────────────────────────────────────
export const extractMessage = (
  body: WhatsAppWebhookPayload
): IncomingMessage | null => {
  try {
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    return message ?? null;
  } catch {
    return null;
  }
};

export const extractContactName = (
  body: WhatsAppWebhookPayload
): string | null => {
  try {
    return (
      body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name ??
      null
    );
  } catch {
    return null;
  }
};

export const extractPhoneNumberId = (
  body: WhatsAppWebhookPayload
): string | null => {
  try {
    return (
      body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null
    );
  } catch {
    return null;
  }
};

// ─── Phone & Timestamp helpers ────────────────────────────────────────────────
export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const formatTimestamp = (timestamp: string): Date => {
  const ms = Number.parseInt(timestamp);
  if (Number.isNaN(ms)) return new Date();
  return new Date(ms * 1000);
};

// ─── Language detection 
export const detectLanguage = (
  text: string
): "en" | "hi" | "te" | "ta" | "hinglish" => {
  // Telugu (U+0C00–U+0C7F)
  if (/[\u0C00-\u0C7F]/.test(text)) return "te";

  // Hindi / Devanagari (U+0900–U+097F) — covers Hindi + Marathi
  if (/[\u0900-\u097F]/.test(text)) return "hi";

  // Tamil (U+0B80–U+0BFF)
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";

  const lowerText = text.toLowerCase().trim();
  const words = lowerText.split(/\s+/);

  // Short casual greeting → Hinglish
  if (CASUAL_GREETINGS.has(words[0]) && words.length <= 2) {
    return "hinglish";
  }

  // Rude / frustration words → Hinglish
  if (RUDE_WORDS.has(lowerText)) return "hinglish";

  // Hinglish vocabulary check
  const hinglishCount = words.filter((word) => HINGLISH_WORDS.has(word)).length;
  if (hinglishCount > 0) return "hinglish";

  return "en";
};
