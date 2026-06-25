import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { prisma } from "../db/client";
import { getBuilderById } from "../services/builder.service";
import { sendLeadNotification } from "../services/whatsapp.service";
import logger from "../utils/logger";

export const brokerAlertWorker = new Worker(
  "broker-alerts",
  async (job: Job<{ leadId: string }>) => {
    const { leadId } = job.data;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { builder: true },
    });

    if (!lead) {
      logger.warn({ leadId }, "Alert skipped: Lead not found");
      return;
    }

    const builder = await getBuilderById(lead.builderId);
    if (!builder?.accessToken) {
      throw new Error(`Builder token invalid: ${lead.builderId}`);
    }

    const brokerPhone = builder.notificationPhone || builder.phoneNumber;
    if (!brokerPhone) {
      logger.warn(
        { builderId: builder.id },
        "Alert skipped: No phone number configured for builder"
      );
      return;
    }

    await sendLeadNotification(
      builder.phoneNumberId,
      builder.accessToken,
      brokerPhone,
      lead,
      builder.businessName
    );

    logger.info({ leadId, brokerPhone }, "✅ Broker alert sent");
  },
  {
    connection: redisConnection,
    concurrency: 3,
    stalledInterval: 30000, 
  }
);

brokerAlertWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Broker alert job completed");
});

brokerAlertWorker.on("failed", (job: Job | undefined, err) => {
  logger.error({ jobId: job?.id, err }, "❌ Broker alert job failed");
});
