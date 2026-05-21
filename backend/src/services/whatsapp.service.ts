import axios from "axios";
import { env } from "../config/index";
import logger from "../utils/logger";

const WA_API_URL = env.WHATSAPP_PHONE_NUMBER_ID
  ? `https://graph.facebook.com/v19.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`
  : "";

const getHeaders = () => {
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    throw new Error("WHATSAPP_ACCESS_TOKEN not set");
  }
  return {
    Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
};

// ========== Send Text Message ==========
export const sendTextMessage = async (
  to: string,
  message: string
): Promise<boolean> => {
  try {
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: message,
      },
    };

    const response = await axios.post(WA_API_URL, payload, {
      headers: getHeaders(),
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

    const response = await axios.post(WA_API_URL, payload, {
      headers: getHeaders(),
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
        action: {
          button: buttonText,
          sections,
        },
      },
    };

    const response = await axios.post(WA_API_URL, payload, {
      headers: getHeaders(),
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
export const markAsRead = async (messageId: string): Promise<boolean> => {
  try {
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    };

    await axios.post(WA_API_URL, payload, {
      headers: getHeaders(),
    });

    logger.info({ messageId }, "✅ Message marked as read");
    return true;
  } catch (error: unknown) {
    const metaError =
      error instanceof Error
        ? (error as any).response?.data ?? error.message
        : error;
    logger.error({ error: metaError, messageId }, "❌ Failed to mark as read");
    return false;
  }
};

// ========== Send Typing Indicator ==========
export const sendTypingIndicator = async (to: string, messageId: string): Promise<boolean> => {
  try {
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    };

    await axios.post(WA_API_URL, payload, { headers: getHeaders() });
    logger.info({ to, messageId }, "✅ Typing indicator sent");
    return true;
  } catch (error: unknown) {
    const metaError = error instanceof Error ? (error as any).response?.data ?? error.message : error;
    logger.error({ error: metaError, to, messageId }, "❌ Failed to send typing indicator");
    return false;
  }
};