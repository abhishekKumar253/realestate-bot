import cron from "node-cron";
import { prisma } from "../db/prisma";
import { sendTextMessage } from "../services/whatsapp.service";
import { decryptToken } from "../utils/crypto";
import logger from "../utils/logger";
import { ConversationState, LeadStatus } from "@prisma/client";

// ─── Follow-up Job ────────────────────────────────────────────────────────────
const startFollowUpCron = () => {
  cron.schedule("0 */2 * * *", async () => {
    logger.info("🔄 Follow-up job started");

    try {
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const staleLeads = await prisma.lead.findMany({
        where: {
          status: { in: [LeadStatus.NEW, LeadStatus.QUALIFIED] },
          updatedAt: { lt: twentyHoursAgo },
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
              "✅ Follow-up sent"
            );
          }
        } catch (err) {
          logger.error({ err, leadId: lead.id }, "❌ Failed for lead");
        }
      }
    } catch (error) {
      logger.error({ error }, "❌ Follow-up job failed");
    }
  });

  logger.info("✅ Follow-up cron scheduled — every 2 hours");
};

// ─── Helper: send daily summary to a single builder ───────────────────────────
const sendDailySummaryToBuilder = async (builder: any) => {
  const accessToken = decryptToken(builder.encryptedToken);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [totalLeads, todayLeads, qualifiedLeads, siteVisitLeads, lostLeads] =
    await Promise.all([
      prisma.lead.count({ where: { builderId: builder.id } }),
      prisma.lead.count({
        where: { builderId: builder.id, createdAt: { gte: todayStart } },
      }),
      prisma.lead.count({
        where: { builderId: builder.id, status: LeadStatus.QUALIFIED },
      }),
      prisma.lead.count({
        where: {
          builderId: builder.id,
          status: LeadStatus.SITE_VISIT_SCHEDULED,
        },
      }),
      prisma.lead.count({
        where: { builderId: builder.id, status: LeadStatus.LOST },
      }),
    ]);

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
  summary += `📈 *Aaj ke Stats:*\n`;
  summary += `• Naye leads aaj: *${todayLeads}*\n`;
  summary += `• Site visit scheduled: *${siteVisitLeads}*\n`;
  summary += `• Qualified leads: *${qualifiedLeads}*\n`;
  summary += `• Lost leads: *${lostLeads}*\n`;
  summary += `• Total leads (all time): *${totalLeads}*\n`;

  if (todayLeads > 0) {
    summary += `\n👥 *Aaj ke Naye Leads:*\n`;
    for (const lead of todayLeadDetails) {
      summary += `• ${lead.name ?? "Unknown"} — ${lead.propertyType ?? "N/A"} ${
        lead.bhk ? `(${lead.bhk})` : ""
      } — ${lead.location ?? "N/A"} — ${lead.budget ?? "N/A"}\n`;
    }
    if (todayLeads > 5) {
      summary += `...aur ${todayLeads - 5} aur leads\n`;
    }
  } else {
    summary += `\nℹ️ Aaj koi naya lead nahi aaya.`;
  }

  summary += `\n📥 *Full export:*\nhttps://realestate-bot-production-3ae3.up.railway.app/export/leads?token=${builder.verifyToken}`;

  await sendTextMessage(
    builder.phoneNumberId,
    accessToken,
    builder.notificationPhone!,
    summary
  );

  logger.info({ builderId: builder.id, todayLeads }, "✅ Daily summary sent");
};

// ─── Daily Summary Cron ───────────────────────────────────────────────────────
const startDailySummaryCron = () => {
  cron.schedule("0 9 * * *", async () => {
    logger.info("📊 Daily summary job started");

    try {
      const builders = await prisma.builder.findMany({
        where: { isActive: true, notificationPhone: { not: null } },
      });

      for (const builder of builders) {
        try {
          await sendDailySummaryToBuilder(builder);
        } catch (err) {
          logger.error(
            { err, builderId: builder.id },
            "❌ Summary failed for builder"
          );
        }
      }
    } catch (error) {
      logger.error({ error }, "❌ Daily summary job failed");
    }
  });

  logger.info("✅ Daily summary cron scheduled — daily at 9 AM");
};

// ─── Export ───────────────────────────────────────────────────────────────────
export const startFollowUpJob = () => {
  startFollowUpCron();
  startDailySummaryCron();
};
