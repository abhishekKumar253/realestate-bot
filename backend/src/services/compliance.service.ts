import { PROHIBITED_PATTERNS } from "../constants/prohibited.patterns";

// Meta 24-hour customer service window check
export const isWithin24hWindow = (lastMessageTimestamp: Date): boolean => {
  const now = new Date();
  const windowEnd = new Date(
    lastMessageTimestamp.getTime() + 24 * 60 * 60 * 1000
  );
  return now <= windowEnd;
};

// Check for Meta policy violations (fake scarcity, investment guarantees)
export const validateMessageContent = (
  text: string
): { isSafe: boolean; reason?: string } => {
  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isSafe: false,
        reason: `Prohibited pattern matched: ${pattern.source}`,
      };
    }
  }
  return { isSafe: true };
};

// Decide if we can send free-form text or need a pre-approved template
export const getRequiredMessageCategory = (
  lastMessageTimestamp: Date
): "SERVICE" | "TEMPLATE_REQUIRED" => {
  return isWithin24hWindow(lastMessageTimestamp)
    ? "SERVICE"
    : "TEMPLATE_REQUIRED";
};
