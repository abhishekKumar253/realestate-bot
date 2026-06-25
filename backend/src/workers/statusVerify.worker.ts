import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { prisma } from "../db/client";
import { getBuilderById } from "../services/builder.service";
import { sendButtonMessage } from "../services/whatsapp.service";
import logger from "../utils/logger";

export const statusVerifyWorker = new Worker(
  "status-verify",
  async (
    job: Job<{ leadId: string; projectId: string; userPhone: string }>
  ) => {
    const { leadId, projectId, userPhone } = job.data;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!lead || !project) {
      logger.warn(
        { leadId, projectId },
        "Status verify skipped: Data not found"
      );
      return;
    }

    const builder = await getBuilderById(lead.builderId);
    if (!builder?.accessToken) {
      throw new Error(`Builder token invalid: ${lead.builderId}`);
    }

    const brokerPhone = builder.notificationPhone || builder.phoneNumber;
    if (!brokerPhone) return;

    const success = await sendButtonMessage(
      builder.phoneNumberId,
      builder.accessToken,
      brokerPhone,
      `📍 User (${userPhone}) ne pucha: *${project.name}* ka construction status kya hai?`,
      [
        { id: `STATUS_UC_${projectId}`, title: "Under Construction" },
        { id: `STATUS_COM_${projectId}`, title: "Completed" },
        { id: `STATUS_DEL_${projectId}`, title: "Delayed" },
      ]
    );

    if (success) {
      logger.info({ projectId, brokerPhone }, "✅ Status query sent to broker");
    } else {
      throw new Error(`Failed to send status query to broker`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    stalledInterval: 30000,
  }
);

statusVerifyWorker.on("failed", (job: Job | undefined, err) => {
  logger.error({ jobId: job?.id, err }, "❌ Status verify job failed");
});
