import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { prisma } from "../db/client";
import {
  sendTextMessage,
  sendTemplateMessage,
} from "../services/whatsapp.service";
import { getBuilderById } from "../services/builder.service";
import { checkMessageCategory } from "../services/compliance.service"; // Correct import
import logger from "../utils/logger";

const FOLLOW_UP_TEXTS = {
  "2H": "Hello! Kya aapko jo property information bheji thi, usme kuch aur jaanna chahte hain? 😊",
  "24H":
    "Namaste! Kya aapne apni property ki requirements decide kar li hain? Agar site visit arrange karni ho toh batayein. 🏠",
  "72H":
    "Hello, humne pichle din baat ki thi. Kya aap abhi bhi interested hain? Hum aapke liye kuch aur options nikal sakte hain. 🙏",
};

export const followUpWorker = new Worker(
  "follow-ups",
  async (job: Job<{ leadId: string; type: "2H" | "24H" | "72H" }>) => {
    const { leadId, type } = job.data;

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        builder: true,
        conversations: {
          where: { state: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!lead || lead.conversations?.length === 0) {
      logger.warn({ leadId }, "Follow-up skipped: No active conversation");
      return;
    }

    const conversation = lead.conversations[0];
    const builder = await getBuilderById(lead.builderId);
    if (!builder) throw new Error(`Builder not found: ${lead.builderId}`);

    const category = await checkMessageCategory(lead.phone, builder.id);
    let isSent = false;

    if (category === "SERVICE") {
      isSent = await sendTextMessage(
        builder.phoneNumberId,
        builder.accessToken,
        lead.phone,
        FOLLOW_UP_TEXTS[type]
      );
    } else {
      isSent = await sendTemplateMessage(
        builder.phoneNumberId,
        builder.accessToken,
        lead.phone,
        `follow_up_${type.toLowerCase()}`,
        "en",
        [lead.name || "Customer"]
      );
    }

    if (isSent) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastFollowUpSentAt: new Date() },
      });
      logger.info({ leadId, type }, "✅ Follow-up sent successfully");
    } else {
      throw new Error(`WhatsApp API failed for lead ${leadId}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    stalledInterval: 30000, 
  }
);

followUpWorker.on("completed", (job) => {
  logger.debug({ jobId: job.id }, "Follow-up job completed");
});

followUpWorker.on("failed", (job: Job | undefined, err) => {
  logger.error({ jobId: job?.id, err }, "Follow-up job failed");
});