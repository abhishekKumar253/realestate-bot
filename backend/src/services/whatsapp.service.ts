import axios from "axios";
import logger from "../utils/logger";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { env } from "../config/index";

// Whisper client for voice note transcription
const openaiWhisper = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const getApiUrl = (phoneNumberId: string) =>
  `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

const getHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

// ========== Send Text Message ==========
export const sendTextMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string
): Promise<boolean> => {
  try {
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    };

    const response = await axios.post(getApiUrl(phoneNumberId), payload, {
      headers: getHeaders(accessToken),
    });

    logger.info(
      { to, messageId: response.data.messages?.[0]?.id },
      "✅ Text message sent"
    );
    return true;
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.error({ error: metaError, to }, "❌ Failed to send text message");
    return false;
  }
};

// ========== Send Interactive Buttons ==========
export const sendButtonMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: string,
  buttons: { id: string; title: string }[]
): Promise<boolean> => {
  try {
    const payload = {
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
    };

    const response = await axios.post(getApiUrl(phoneNumberId), payload, {
      headers: getHeaders(accessToken),
    });

    logger.info(
      { to, messageId: response.data.messages?.[0]?.id },
      "✅ Button message sent"
    );
    return true;
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.error({ error: metaError, to }, "❌ Failed to send button message");
    return false;
  }
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
  try {
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: message },
        action: { button: buttonText, sections },
      },
    };

    const response = await axios.post(getApiUrl(phoneNumberId), payload, {
      headers: getHeaders(accessToken),
    });

    logger.info(
      { to, messageId: response.data.messages?.[0]?.id },
      "✅ List message sent"
    );
    return true;
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.error({ error: metaError, to }, "❌ Failed to send list message");
    return false;
  }
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

    logger.info({ messageId }, "✅ Message marked as read");
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.warn({ error: metaError, messageId }, "⚠️ Failed to mark as read");
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
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    };

    await axios.post(getApiUrl(phoneNumberId), payload, {
      headers: getHeaders(accessToken),
    });

    logger.info({ to }, "✅ Typing indicator sent");
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.warn({ error: metaError, to }, "⚠️ Failed to send typing indicator");
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
  try {
    const payload = {
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
            parameters: bodyParams.map((text) => ({
              type: "text",
              text,
            })),
          },
        ],
      },
    };

    const response = await axios.post(getApiUrl(phoneNumberId), payload, {
      headers: getHeaders(accessToken),
    });

    logger.info(
      { to, templateName, messageId: response.data.messages?.[0]?.id },
      "✅ Template message sent"
    );
    return true;
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.error(
      { error: metaError, to, templateName },
      "❌ Failed to send template message"
    );
    return false;
  }
};

// ========== Send Lead Notification to Broker (TEMPLATE-BASED) ==========
export const sendLeadNotification = async (
  phoneNumberId: string,
  accessToken: string,
  brokerPhone: string,
  lead: {
    name?: string | null;
    phone: string;
    propertyType?: string | null;
    budget?: string | null;
    location?: string | null;
    bhk?: string | null;
    purpose?: string | null;
    timeline?: string | null;
    amenities?: string | null;
    possession?: string | null;
    loanStatus?: string | null;
    siteVisitDay?: string | null;
    siteVisitTime?: string | null;
    otherPropertyTypes?: string | null;
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
💰 *Budget:* ${lead.budget ?? "N/A"}
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

✅ *Lead qualify ho gayi!*`;

  await sendTextMessage(phoneNumberId, accessToken, brokerPhone, message)
    .then(() => logger.info({ brokerPhone }, "✅ Lead notification sent"))
    .catch((err) => logger.error({ err }, "❌ Notification failed"));
};

// ========== Voice Note Transcription ==========
export const transcribeVoiceNote = async (
  accessToken: string,
  mediaId: string
): Promise<string | null> => {
  try {
    // 1. Get media URL
    const mediaRes = await axios.get(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      {
        headers: getHeaders(accessToken),
      }
    );
    const mediaUrl = mediaRes.data.url;
    if (!mediaUrl) {
      logger.error({ mediaId }, "❌ No media URL returned");
      return null;
    }

    // 2. Download audio file
    const audioRes = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: getHeaders(accessToken),
    });
    const audioBuffer = Buffer.from(audioRes.data);

    // 3. Transcribe with Whisper
    const audioFile = await toFile(audioBuffer, "voice.ogg");
    const transcript = await openaiWhisper.audio.transcriptions.create({
      model: "whisper-1",
      file: audioFile,
    });

    logger.info({ transcript: transcript.text }, "✅ Voice note transcribed");
    return transcript.text;
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.error(
      { error: metaError, mediaId },
      "❌ Voice transcription failed"
    );
    return null;
  }
};
