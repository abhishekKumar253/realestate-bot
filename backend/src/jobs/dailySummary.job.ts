import cron from "node-cron";
import { prisma } from "../db/client";
import { sendTextMessage } from "../services/whatsapp.service";
import { getBuilderById } from "../services/builder.service";
import { env } from "../config/env";
import logger from "../utils/logger";
import { LeadStatus } from "@prisma/client";

const sendDailySummaryToBuilder = async (builderId: string) => {
  const builder = await getBuilderById(builderId);
  if (!builder?.notificationPhone || !builder?.accessToken) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalLeads, todayLeads, qualifiedLeads, lostLeads] = await Promise.all(
    [
      prisma.lead.count({ where: { builderId: builder.id } }),
      prisma.lead.count({
        where: { builderId: builder.id, createdAt: { gte: todayStart } },
      }),
      prisma.lead.count({
        where: { builderId: builder.id, status: LeadStatus.QUALIFIED },
      }),
      prisma.lead.count({
        where: { builderId: builder.id, status: LeadStatus.LOST },
      }),
    ]
  );

  const todayLeadDetails = await prisma.lead.findMany({
    where: { builderId: builder.id, createdAt: { gte: todayStart } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const todayDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let summary = `📊 *Daily Lead Summary — ${todayDate}*\n`;
  summary += `🏢 *${builder.businessName}*\n\n`;
  summary += `📈 *Today's Stats:*\n`;
  summary += `• New leads today: *${todayLeads}*\n`;
  summary += `• Qualified leads: *${qualifiedLeads}*\n`;
  summary += `• Lost leads: *${lostLeads}*\n`;
  summary += `• Total leads (all time): *${totalLeads}*\n`;

  if (todayLeads > 0) {
    summary += `\n👥 *Today's New Leads:*\n`;
    for (const lead of todayLeadDetails) {
      const budgetStr =
        lead.minBudget && lead.maxBudget
          ? `${lead.minBudget}L - ${lead.maxBudget}L`
          : "N/A";
      summary += `• ${lead.name ?? "Unknown"} — ${lead.propertyType ?? "N/A"} ${
        lead.bhk ? `(${lead.bhk})` : ""
      } — ${lead.location ?? "N/A"} — ${budgetStr}\n`;
    }
    if (todayLeads > 5) {
      summary += `...and ${todayLeads - 5} more leads\n`;
    }
  } else {
    summary += `\nℹ️ No new leads today.`;
  }

  summary += `\n📥 *Full export:*\n${env.APP_URL}/export/leads?token=${builder.id}`;

  await sendTextMessage(
    builder.phoneNumberId,
    builder.accessToken,
    builder.notificationPhone,
    summary
  );

  logger.info({ builderId: builder.id, todayLeads }, "✅ Daily summary sent");
};

const startDailySummaryCron = () => {
  cron.schedule(
    "0 9 * * *",
    async () => {
      logger.info("📊 Daily summary job started");
      try {
        const activeBuilders = await prisma.builder.findMany({
          where: { isActive: true, notificationPhone: { not: null } },
          select: { id: true },
        });

        for (const { id } of activeBuilders) {
          try {
            await sendDailySummaryToBuilder(id);
          } catch (err) {
            logger.error(
              { err, builderId: id },
              "❌ Summary failed for builder"
            );
          }
        }
      } catch (error) {
        logger.error({ error }, "❌ Daily summary job failed");
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  logger.info("✅ Daily summary cron scheduled — daily at 9 AM IST");
};

export const startCronJobs = () => {
  startDailySummaryCron();
};
