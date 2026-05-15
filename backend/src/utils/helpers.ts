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