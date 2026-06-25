import { prisma } from "../db/client";
import { PROHIBITED_PATTERNS } from "../constants/prohibited.patterns";
import logger from "../utils/logger";

export type MessageCategory = "SERVICE" | "TEMPLATE_REQUIRED";

// ========== 24h Window Check ==========
export const isWithin24hWindow = (lastMessageTimestamp: Date): boolean => {
  const now = new Date();
  const windowEnd = new Date(
    lastMessageTimestamp.getTime() + 24 * 60 * 60 * 1000
  );
  return now <= windowEnd;
};

// ========== Prohibited Content Check ==========
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

// ========== DB-based 24h Category Check ==========
export const checkMessageCategory = async (
  leadPhone: string,
  builderId: string
): Promise<MessageCategory> => {
  try {
    const lastMessage = await prisma.message.findFirst({
      where: {
        conversation: {
          lead: {
            phone: leadPhone,
            builderId,
          },
        },
        role: "BOT",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (!lastMessage) return "SERVICE";

    return isWithin24hWindow(lastMessage.createdAt)
      ? "SERVICE"
      : "TEMPLATE_REQUIRED";
  } catch (error) {
    logger.error({ error, leadPhone }, "❌ Failed to check 24h window");
    return "TEMPLATE_REQUIRED";
  }
};

// ========== Simple Category from Timestamp ==========
export const getRequiredMessageCategory = (
  lastMessageTimestamp: Date
): MessageCategory => {
  return isWithin24hWindow(lastMessageTimestamp)
    ? "SERVICE"
    : "TEMPLATE_REQUIRED";
};
