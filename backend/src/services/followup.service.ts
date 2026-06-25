import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";
import logger from "../utils/logger";

export const followUpQueue = new Queue("follow-ups", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

export const scheduleFollowUp = async (
  leadId: string,
  type: "2H" | "24H" | "72H",
  delayMs: number
): Promise<void> => {
  try {
    const jobId = `followup-${type}-${leadId}`;

    const existingJob = await followUpQueue.getJob(jobId);
    if (existingJob) {
      logger.info({ jobId }, "⚠️ Follow-up already scheduled, skipping");
      return;
    }

    await followUpQueue.add(
      jobId,
      { leadId, type },
      {
        jobId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );

    logger.info({ leadId, type, delayMs }, "✅ Follow-up job scheduled");
  } catch (error) {
    logger.error({ error, leadId, type }, "❌ Failed to schedule follow-up");
  }
};

export const cancelFollowUps = async (leadId: string): Promise<void> => {
  try {
    const jobs = await followUpQueue.getJobs(["delayed", "waiting", "active"]);
    const jobsToCancel = jobs.filter((job) => job.data.leadId === leadId);

    await Promise.all(jobsToCancel.map((job) => job.remove()));

    if (jobsToCancel.length > 0) {
      logger.info(
        { leadId, count: jobsToCancel.length },
        "🗑️ Follow-up jobs cancelled"
      );
    }
  } catch (error) {
    logger.error({ error, leadId }, "❌ Failed to cancel follow-ups");
  }
};
