import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { env } from "./index";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1,
    profilesSampleRate: 1,
    environment: env.NODE_ENV,
  });
}