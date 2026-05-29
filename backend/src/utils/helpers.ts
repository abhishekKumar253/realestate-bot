import {
  WhatsAppWebhookPayload,
  IncomingMessage,
} from "../types/whatsapp.types";
import {
  HINGLISH_WORDS,
  CASUAL_GREETINGS,
} from "../constants/conversation.constants";

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

export const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, "");
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

export const formatTimestamp = (timestamp: string): Date => {
  return new Date(Number.parseInt(timestamp) * 1000);
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

/**
 * Detect language of a message: Devanagari (Hindi), English, or Hinglish.
 * Used to force bot replies in the correct language.
 */
export const detectLanguage = (
  text: string
): "hindi" | "english" | "hinglish" => {
  if (/[\u0900-\u097F]/.test(text)) return "hindi";

  const lowerText = text.toLowerCase().trim();
  const words = lowerText.split(/\s+/);

  // Short casual greeting → Hinglish
  if (CASUAL_GREETINGS.has(words[0]) && words.length <= 2) {
    return "hinglish";
  }

  // 3. Frustration / Rude words → force Hinglish (so bot replies in Hinglish, not English)
  const rudeWords = new Set([
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
  if (rudeWords.has(lowerText)) return "hinglish";

  // If any Hinglish word found → Hinglish
  const hinglishCount = words.filter((word) => HINGLISH_WORDS.has(word)).length;
  if (hinglishCount > 0) return "hinglish";

  // Default to English
  return "english";
};
