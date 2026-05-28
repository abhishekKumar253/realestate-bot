import axios from "axios";
import logger from "../utils/logger";

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

    logger.info({ to, messageId: response.data.messages?.[0]?.id }, "✅ Text message sent");
    return true;
  } catch (error: unknown) {
    const metaError = error instanceof Error ? (error as any).response?.data ?? error.message : error;
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

    logger.info({ to, messageId: response.data.messages?.[0]?.id }, "✅ Button message sent");
    return true;
  } catch (error: unknown) {
    const metaError = error instanceof Error ? (error as any).response?.data ?? error.message : error;
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

    logger.info({ to, messageId: response.data.messages?.[0]?.id }, "✅ List message sent");
    return true;
  } catch (error: unknown) {
    const metaError = error instanceof Error ? (error as any).response?.data ?? error.message : error;
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
    // Non-critical — log as warn only
    const metaError = error instanceof Error ? (error as any).response?.data ?? error.message : error;
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
    const metaError = error instanceof Error ? (error as any).response?.data ?? error.message : error;
    logger.warn({ error: metaError, to }, "⚠️ Failed to send typing indicator");
  }
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
    budget?: string | null;
    location?: string | null;
    bhk?: string | null;
    purpose?: string | null;
    timeline?: string | null;
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

  const message = `
🏠 *New Lead — ${businessName}*

👤 *Naam:* ${lead.name ?? "Unknown"}
📞 *Phone:* +${lead.phone}
🏡 *Property:* ${lead.propertyType ?? "N/A"} ${lead.bhk ? `(${lead.bhk})` : ""}
📍 *Location:* ${lead.location ?? "N/A"}
💰 *Budget:* ${lead.budget ?? "N/A"}
🎯 *Purpose:* ${lead.purpose ? purposeMap[lead.purpose] ?? lead.purpose : "N/A"}
⏰ *Timeline:* ${lead.timeline ? timelineMap[lead.timeline] ?? lead.timeline : "N/A"}

✅ *Site visit ke liye taiyaar hai!*
  `.trim();

  try {
    await sendTextMessage(phoneNumberId, accessToken, brokerPhone, message);
    logger.info({ brokerPhone }, "✅ Lead notification sent to broker");
  } catch (error) {
    logger.error({ error, brokerPhone }, "❌ Failed to send lead notification");
  }
};