import * as Sentry from "@sentry/node";
import { env } from "./index";
import logger from "../utils/logger";

if (env.SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1,
      profilesSampleRate: 1,
      environment: env.NODE_ENV,
    });
    logger.info("✅ Sentry initialized successfully");
  } catch (error) {
    logger.error({ error }, "❌ Failed to initialize Sentry");
  }
} else {
  logger.warn("⚠️  SENTRY_DSN not set. Sentry is disabled.");
}
