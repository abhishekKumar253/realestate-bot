import Redis from "ioredis";
import { env } from "../config/env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const redisConnection = {
  url: env.REDIS_URL,
};
