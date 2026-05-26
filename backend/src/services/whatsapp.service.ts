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