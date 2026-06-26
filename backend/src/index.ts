import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";
import logger from "./utils/logger";
import { prisma } from "./db/client";
import { redis } from "./config/redis";

// Routes
import webhookRoute from "./routes/webhook.route";
import exportRoute from "./routes/export.route";
import healthRoute from "./routes/health.route";

// Workers (Side-effects on import)
import "./workers/followup.worker";
import "./workers/brokerAlert.worker";
import "./workers/statusVerify.worker";

// Cron Jobs
import { startCronJobs } from "./jobs/dailySummary.job.js";
import { startQualityMonitor } from "./jobs/qualityMonitor.job.js";
import { startFollowUpJob } from "./jobs/followup.job.js";

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// ========== Middlewares ==========
app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);
app.use(pinoHttp({ logger }));

// ========== Routes ==========
app.use("/api", webhookRoute);
app.use("/api", exportRoute);
app.use("/api", healthRoute);

// ========== 404 Handler ==========
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// ========== Global Error Handler ==========
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    Sentry.captureException(err);
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ success: false, error: "Internal server error" });
  }
);

// ========== Background Tasks ==========
startCronJobs();
startQualityMonitor();
startFollowUpJob();

// ========== Start Server & Graceful Shutdown ==========
const server = app.listen(PORT, () => {
  logger.info(`🚀 LeadKaro API running on http://localhost:${PORT}`);
});

const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down gracefully...");

  server.close(async () => {
    logger.info("HTTP server closed");

    await prisma
      .$disconnect()
      .catch(() => logger.warn("Prisma disconnect failed"));
    await redis.quit().catch(() => logger.warn("Redis disconnect failed"));

    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
