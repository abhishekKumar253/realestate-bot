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

app.use(helmet());
app.use(
  express.json({
    verify: (_req: any, _res, buf) => {
      _req.rawBody = buf.toString();
    },
  })
);
app.use(express.urlencoded({ extended: true }));

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

app.use("/webhook", webhookLimiter, webhookRouter);

app.get("/health", generalLimiter, (_req, res) => {
  res.status(200).json({
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});


app.use(
  async (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error({ err }, "Unhandled error");

    if (env.SENTRY_DSN) {
      Sentry.captureException(err);
      await Sentry.flush(3000);
    }
    res.status(500).json({ error: "Internal server error" });
  }
);

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