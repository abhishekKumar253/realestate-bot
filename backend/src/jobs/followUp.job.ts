import cron from "node-cron";
import { prisma } from "../db/client";
import { scheduleFollowUp } from "../services/followup.service";
import { LeadStatus } from "@prisma/client";
import logger from "../utils/logger";


const startFollowUpRecoveryCron = () => {
  cron.schedule("*/15 * * * *", async () => {
    logger.debug("🔄 Follow-up recovery check started");

    try {
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);

      const staleLeads = await prisma.lead.findMany({
        where: {
          status: LeadStatus.QUALIFIED,
          updatedAt: { lt: twentyHoursAgo },
        },
        select: { id: true, updatedAt: true },
      });

      if (staleLeads.length === 0) return;

      for (const lead of staleLeads) {
        const hoursIdle =
          (Date.now() - lead.updatedAt.getTime()) / (1000 * 60 * 60);

        if (hoursIdle >= 20 && hoursIdle < 26) {
          await scheduleFollowUp(lead.id, "24H", 0);
        } else if (hoursIdle >= 68 && hoursIdle < 74) {
          await scheduleFollowUp(lead.id, "72H", 0);
        }
      }
    } catch (error) {
      logger.error({ error }, "❌ Follow-up recovery cron failed");
    }
  });

  logger.info("✅ Follow-up recovery cron scheduled — every 15 mins");
};

export const startFollowUpJob = startFollowUpRecoveryCron;
