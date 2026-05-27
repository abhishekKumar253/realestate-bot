import { WhatsAppWebhookPayload, IncomingMessage } from "../types/whatsapp.types";

export const extractMessage = (body: WhatsAppWebhookPayload): IncomingMessage | null => {
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

export const extractContactName = (body: WhatsAppWebhookPayload): string | null => {
  try {
    return body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name ?? null;
  } catch {
    return null;
  }
};

export const formatTimestamp = (timestamp: string): Date => {
  return new Date(Number.parseInt(timestamp) * 1000);
};

export const extractPhoneNumberId = (body: WhatsAppWebhookPayload): string | null => {
  try {
    return body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
  } catch {
    return null;
  }
};

const HINGLISH_WORDS = new Set([
  "kya", "hai", "hain", "mujhe", "chahiye", "leke", "denge", "kar", "ka", "ki",
  "mein", "aap", "aapko", "hum", "humein", "batao", "dekho", "suno", "jao", "karo",
  "hoga", "hogi", "honge", "tha", "thi", "the", "karna", "karte", "karti", "hu",
  "mai", "tum", "tumhara", "apna", "yeh", "woh", "nahi", "na", "ji", "haan", "are",
  "aur", "bhi", "hi", "toh", "tho", "par",
]);

/**
 * Detect language of a message: Devanagari (Hindi), English, or Hinglish.
 * Used to force bot replies in the correct language.
 */
export const detectLanguage = (text: string): "hindi" | "english" | "hinglish" => {
  // Check for Devanagari script (Hindi)
  if (/[\u0900-\u097F]/.test(text)) {
    return "hindi";
  }

  // Count how many common Hinglish words appear in the message
  const words = text.toLowerCase().split(/\s+/);
  const hinglishCount = words.filter((word) => HINGLISH_WORDS.has(word)).length;

  // If 2 or more Hinglish words present, treat as Hinglish
  if (hinglishCount >= 1) {
  return "hinglish";
}

  // Default: English
  return "english";
};