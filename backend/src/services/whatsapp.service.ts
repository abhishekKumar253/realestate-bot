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

// ========== Notification helpers (reduce cognitive complexity) ==========

function buildPropertyPart(lead: {
  propertyType?: string | null;
  bhk?: string | null;
}): string | null {
  if (!lead.propertyType) return null;
  const bhkSuffix = lead.bhk ? " (" + lead.bhk + ")" : "";
  return "🏡 Property: " + lead.propertyType + bhkSuffix;
}

function buildBudgetPart(lead: {
  minBudget?: number | null;
  maxBudget?: number | null;
  budget?: string | null;
}): string | null {
  if (lead.minBudget != null && lead.maxBudget != null) {
    const minL = (lead.minBudget / 100000).toFixed(0);
    const maxL = (lead.maxBudget / 100000).toFixed(0);
    if (lead.minBudget === lead.maxBudget) {
      return "💰 Budget: ₹" + minL + " Lakh";
    }
    return "💰 Budget: ₹" + minL + "–" + maxL + " Lakh";
  }
  if (lead.budget) {
    return "💰 Budget: " + lead.budget;
  }
  return null;
}

function buildPurposePart(
  lead: { purpose?: string | null },
  purposeMap: Record<string, string>
): string | null {
  if (!lead.purpose) return null;
  return "🎯 Purpose: " + (purposeMap[lead.purpose] ?? lead.purpose);
}

function buildTimelinePart(
  lead: { timeline?: string | null },
  timelineMap: Record<string, string>
): string | null {
  if (!lead.timeline) return null;
  return "⏰ Timeline: " + (timelineMap[lead.timeline] ?? lead.timeline);
}

function buildPossessionPart(
  lead: { possession?: string | null },
  possessionMap: Record<string, string>
): string | null {
  if (!lead.possession) return null;
  return (
    "🏗️ Possession: " + (possessionMap[lead.possession] ?? lead.possession)
  );
}

function buildSiteVisitPart(lead: {
  siteVisitDay?: string | null;
  siteVisitTime?: string | null;
}): string | null {
  if (!lead.siteVisitDay) return null;
  const timeSuffix = lead.siteVisitTime ? " at " + lead.siteVisitTime : "";
  return "📅 Site Visit: " + lead.siteVisitDay + timeSuffix;
}

// ========== Send Lead Notification to Broker (REFACTORED) ==========
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

  const possessionMap: Record<string, string> = {
    READY_TO_MOVE: "Ready to move",
    UNDER_CONSTRUCTION: "Under construction",
  };

  const parts: string[] = [
    `🏠 *New Lead for ${businessName}*`,
    `👤 Naam: ${lead.name ?? "Unknown"}`,
    `📞 Phone: +${lead.phone}`,
  ];

  // Build each part using helpers – no nesting, low complexity
  const propertyPart = buildPropertyPart(lead);
  if (propertyPart) parts.push(propertyPart);

  if (lead.otherPropertyTypes) {
    parts.push("🔁 Also interested in: " + lead.otherPropertyTypes);
  }

  if (lead.location) parts.push("📍 Location: " + lead.location);

  const budgetPart = buildBudgetPart(lead);
  if (budgetPart) parts.push(budgetPart);

  const purposePart = buildPurposePart(lead, purposeMap);
  if (purposePart) parts.push(purposePart);

  const timelinePart = buildTimelinePart(lead, timelineMap);
  if (timelinePart) parts.push(timelinePart);

  if (lead.amenities) parts.push("🛠️ Amenities: " + lead.amenities);

  const possessionPart = buildPossessionPart(lead, possessionMap);
  if (possessionPart) parts.push(possessionPart);

  if (lead.loanStatus) parts.push("🏦 Loan: " + lead.loanStatus);

  const visitPart = buildSiteVisitPart(lead);
  if (visitPart) parts.push(visitPart);

  const message = parts.join("\n");

  try {
    await sendTextMessage(phoneNumberId, accessToken, brokerPhone, message);
    logger.info({ brokerPhone }, "✅ Detailed lead notification sent");
  } catch (error) {
    logger.error(
      { error, brokerPhone },
      "❌ Failed to send detailed lead notification"
    );
  }
};
