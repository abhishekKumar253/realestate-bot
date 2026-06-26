import {
  WhatsAppWebhookPayload,
  IncomingMessage,
} from "../types/whatsapp.types.js";
import {
  HINGLISH_WORDS,
  CASUAL_GREETINGS,
  RUDE_WORDS,
} from "../constants/conversation.phrases.js";
import { LEAD_SCORE_WEIGHTS } from "../constants/lead.score.weights.js";


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
): "english" | "hindi" | "telugu" | "tamil" | "hinglish" => {
  if (/[\u0C00-\u0C7F]/.test(text)) return "telugu";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";

  const lowerText = text.toLowerCase().trim();
  const words = lowerText.split(/\s+/);

  if (CASUAL_GREETINGS.has(words[0]) && words.length <= 2) return "hinglish";
  if (RUDE_WORDS.has(lowerText)) return "hinglish";

  const hinglishCount = words.filter((w) => HINGLISH_WORDS.has(w)).length;
  if (hinglishCount > 0) return "hinglish";

  return "english";
};


export const calculateLeadScore = (extractedData: {
  bhk?: string;
  location?: string;
  minBudget?: number;
  maxBudget?: number;
  purpose?: string;
  timeline?: string;
  wantsVisit?: boolean;
}): number => {
  let score = 0;

  if (extractedData.minBudget || extractedData.maxBudget)
    score += LEAD_SCORE_WEIGHTS.BUDGET;
  if (extractedData.location) score += LEAD_SCORE_WEIGHTS.LOCATION;
  if (extractedData.timeline) score += LEAD_SCORE_WEIGHTS.TIMELINE;
  if (extractedData.bhk) score += LEAD_SCORE_WEIGHTS.BHK;
  if (extractedData.purpose) score += LEAD_SCORE_WEIGHTS.PURPOSE;
  if (extractedData.wantsVisit) score += LEAD_SCORE_WEIGHTS.SITE_VISIT;

  return score;
};