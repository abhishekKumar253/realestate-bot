import cron from "node-cron";
import { prisma } from "../db/prisma";
import { sendTextMessage } from "../services/whatsapp.service";
import { decryptToken } from "../utils/crypto";
import logger from "../utils/logger";
import { ConversationState, LeadStatus } from "@prisma/client";

// Har 2 ghante run (20‑hour cutoff, 7‑day cooldown)
export const startFollowUpJob = () => {
  cron.schedule("0 */2 * * *", async () => {
    logger.info("🔄 Follow‑up job started");

    try {
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Eligible leads:
      const staleLeads = await prisma.lead.findMany({
        where: {
          status: { in: [LeadStatus.NEW, LeadStatus.QUALIFIED] },
          updatedAt: { lt: twentyHoursAgo }, // 20 hrs inactive
          conversations: {
            some: {
              state: { not: ConversationState.COMPLETED },
              OR: [
                { lastFollowUpSentAt: null },
                { lastFollowUpSentAt: { lt: sevenDaysAgo } },
              ],
            },
          },
        },
        include: {
          builder: true,
          conversations: {
            where: { state: { not: ConversationState.COMPLETED } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      logger.info({ count: staleLeads.length }, "📋 Stale leads eligible");

      for (const lead of staleLeads) {
        const conversation = lead.conversations[0];
        if (!conversation) continue;

        try {
          const accessToken = decryptToken(lead.builder.encryptedToken);
          const name = lead.name ? ` ${lead.name} जी` : "";
          const message = `Namaste${name}! 🏠 Kya aap abhi bhi property dhundh rahe hain? Hamari team aapki madad ke liye taiyaar hai. Bas batayein!`;

          const sent = await sendTextMessage(
            lead.builder.phoneNumberId,
            accessToken,
            lead.phone,
            message
          );

          if (sent) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { lastFollowUpSentAt: new Date() },
            });
            logger.info(
              { leadId: lead.id, phone: lead.phone },
              "✅ Follow‑up sent"
            );
          }
        } catch (err) {
          logger.error({ err, leadId: lead.id }, "❌ Failed for lead");
        }
      }
    } catch (error) {
      logger.error({ error }, "❌ Follow‑up job failed");
    }
  });

  logger.info("✅ Follow‑up cron scheduled — every 2 hours");
};
