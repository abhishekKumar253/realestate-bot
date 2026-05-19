import "./config/sentry";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as Sentry from "@sentry/node";
import { env } from "./config/index";
import logger from "./utils/logger";
import { prisma } from "./db/prisma";
import webhookRouter from "./routes/webhook.route";

const app = express();

// ========== Middlewares ==========
app.use(helmet());
app.use(
  express.json({
    verify: (_req: any, _res, buf) => {
      _req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// ========== Rate Limiting ==========
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: "Too many requests, please try again later.",
});

// ========== Routes ==========
app.use("/webhook", webhookLimiter, webhookRouter);

// ========== Health Check ==========
app.get("/health", generalLimiter, (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ========== Temporary Sentry Test Route ==========
app.get("/debug-sentry", (_req, _res) => {
  throw new Error("SENTRY_GUARANTEED_TEST_ERROR");
});

// ========== Global Error Handler ==========
app.use(
  async (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    // Log immediately
    logger.error({ err }, "Unhandled error");

    // Capture and flush Sentry BEFORE sending response
    if (env.SENTRY_DSN) {
      Sentry.captureException(err);
      // Wait up to 3 seconds for delivery (serverless safe)
      await Sentry.flush(3000);
    }

    // Send error response after Sentry event is delivered
    res.status(500).json({ error: "Internal server error" });
  }
);

// ========== Server Start ==========
const PORT = Number.parseInt(env.PORT, 10) || 5000;

const start = async () => {
  try {
    await prisma.$connect();
    logger.info("✅ Database connected");

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${env.NODE_ENV} mode`);
    });
  } catch (error) {
    logger.error({ error }, "❌ Failed to start server");
    if (env.SENTRY_DSN) {
      Sentry.captureException(error);
      await Sentry.flush(3000);
    }
    process.exit(1);
  }
};

start();