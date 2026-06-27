import axios, { AxiosError } from "axios";
import logger from "../utils/logger";
import { toFile } from "openai/uploads";
import { openai } from "../config/openai";
import { env } from "../config/env";
import { withRetry } from "../utils/retry";

const getApiUrl = (phoneNumberId: string) =>
  `https://graph.facebook.com/${env.META_API_VERSION}/${phoneNumberId}/messages`;

const getHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

const getMetaError = (error: unknown) =>
  error instanceof AxiosError ? error.response?.data ?? error.message : error;

// ========== Send Text Message ==========
export const sendTextMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string
): Promise<boolean> => {
  return withRetry(
    async () => {
      const response = await axios.post(
        getApiUrl(phoneNumberId),
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: message },
        },
        { headers: getHeaders(accessToken) }
      );

      logger.info(
        { to, messageId: response.data.messages?.[0]?.id },
        "Text message sent"
      );
      return true;
    },
    3,
    1000,
    "sendTextMessage"
  );
};

// ========== Send Interactive Buttons ==========
export const sendButtonMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string,
  buttons: { id: string; title: string }[]
): Promise<boolean> => {
  return withRetry(
    async () => {
      const response = await axios.post(
        getApiUrl(phoneNumberId),
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: message },
            action: {
              buttons: buttons.map((btn) => ({
                type: "reply",
                reply: { id: btn.id, title: btn.title },
              })),
            },
          },
        },
        { headers: getHeaders(accessToken) }
      );

      logger.info(
        { to, messageId: response.data.messages?.[0]?.id },
        "Button message sent"
      );
      return true;
    },
    3,
    1000,
    "sendButtonMessage"
  );
};

// ========== Send List Message ==========
export const sendListMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string,
  buttonText: string,
  sections: {
    title: string;
    rows: { id: string; title: string; description?: string }[];
  }[]
): Promise<boolean> => {
  return withRetry(
    async () => {
      const response = await axios.post(
        getApiUrl(phoneNumberId),
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "interactive",
          interactive: {
            type: "list",
            body: { text: message },
            action: { button: buttonText, sections },
          },
        },
        { headers: getHeaders(accessToken) }
      );

      logger.info(
        { to, messageId: response.data.messages?.[0]?.id },
        "List message sent"
      );
      return true;
    },
    3,
    1000,
    "sendListMessage"
  );
};

// ========== Mark Message as Read ==========
export const markAsRead = async (
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> => {
  try {
    await axios.post(
      getApiUrl(phoneNumberId),
      { messaging_product: "whatsapp", status: "read", message_id: messageId },
      { headers: getHeaders(accessToken) }
    );
    logger.info({ messageId }, "Message marked as read");
  } catch (error) {
    logger.warn(
      { error: getMetaError(error), messageId },
      "Failed to mark as read"
    );
  }
};

// ========== Send Template Message ==========
export const sendTemplateMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Promise<boolean> => {
  return withRetry(
    async () => {
      const response = await axios.post(
        getApiUrl(phoneNumberId),
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: "body",
                parameters: bodyParams.map((text) => ({ type: "text", text })),
              },
            ],
          },
        },
        { headers: getHeaders(accessToken) }
      );

      logger.info(
        { to, templateName, messageId: response.data.messages?.[0]?.id },
        "Template message sent"
      );
      return true;
    },
    3,
    1000,
    "sendTemplateMessage"
  );
};

// ========== Send Lead Notification to Broker ==========
export const sendLeadNotification = async (
  phoneNumberId: string,
  accessToken: string,
  brokerPhone: string,
  lead: {
    name?: string | null;
    phone: string;
    propertyType?: string | null;
    location?: string | null;
    bhk?: string | null;
    purpose?: string | null;
    timeline?: string | null;
    amenities?: string | null;
    possession?: string | null;
    loanStatus?: string | null;
    siteVisitDay?: string | null;
    siteVisitTime?: string | null;
    minBudget?: number | null;
    maxBudget?: number | null;
  },
  businessName: string
): Promise<void> => {
  const timelineMap: Record<string, string> = {
    ONE_MONTH: "1 mahine mein",
    THREE_MONTHS: "3 mahine mein",
    SIX_MONTHS: "6 mahine mein",
    MORE_THAN_SIX_MONTHS: "6 mahine ke baad",
  };

  const purposeMap: Record<string, string> = {
    INVESTMENT: "Investment",
    END_USE: "Khud rehne ke liye",
  };

  const message = `🏠 *New Lead — ${businessName}*

👤 *Naam:* ${lead.name ?? "Unknown"}
📞 *Phone:* +${lead.phone}
🏡 *Property:* ${lead.propertyType ?? "N/A"} ${lead.bhk ? `(${lead.bhk})` : ""}
📍 *Location:* ${lead.location ?? "N/A"}
💰 *Budget:* ${
    lead.minBudget && lead.maxBudget
      ? `${lead.minBudget}L - ${lead.maxBudget}L`
      : "N/A"
  }
🎯 *Purpose:* ${lead.purpose ? purposeMap[lead.purpose] ?? lead.purpose : "N/A"}
⏰ *Timeline:* ${
    lead.timeline ? timelineMap[lead.timeline] ?? lead.timeline : "N/A"
  }
 ${lead.amenities ? `✨ *Amenities:* ${lead.amenities}` : ""}
 ${
   lead.siteVisitDay
     ? `📅 *Site Visit:* ${lead.siteVisitDay} ${lead.siteVisitTime ?? ""}`
     : ""
 }

✅ *Lead successfully qualified!*`;

  const success = await sendTextMessage(
    phoneNumberId,
    accessToken,
    brokerPhone,
    message
  );

  if (success) {
    logger.info({ brokerPhone }, "Lead notification sent");
  } else {
    logger.error({ brokerPhone }, "Notification failed");
  }
};

// ========== Voice Note Transcription ==========
export const transcribeVoiceNote = async (
  accessToken: string,
  mediaId: string
): Promise<string | null> => {
  try {
    const mediaRes = await axios.get(
      `https://graph.facebook.com/${env.META_API_VERSION}/${mediaId}`,
      {
        headers: getHeaders(accessToken),
      }
    );
    const mediaUrl = mediaRes.data.url;
    if (!mediaUrl) {
      logger.error({ mediaId }, "No media URL returned");
      return null;
    }

    const audioRes = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: getHeaders(accessToken),
    });
    const audioBuffer = Buffer.from(audioRes.data);

    const audioFile = await toFile(audioBuffer, "voice.ogg");
    const transcript = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
    });

    logger.info({ transcript: transcript.text }, "Voice note transcribed");
    return transcript.text;
  } catch (error) {
    logger.error(
      { error: getMetaError(error), mediaId },
      "Voice transcription failed"
    );
    return null;
  }
};

// ========== Send Typing Indicator ==========
export const sendTypingIndicator = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  messageId: string
): Promise<void> => {
  try {
    await axios.post(
      getApiUrl(phoneNumberId),
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" },
      },
      { headers: getHeaders(accessToken) }
    );
    logger.info({ to }, "✅ Typing indicator sent");
  } catch (error) {
    logger.warn(
      { error: getMetaError(error), to },
      "⚠️ Typing indicator failed"
    );
  }
};