import type { Request, Response } from "express";
import { prisma } from "../db/client";
import { redis } from "../config/redis";
import logger from "../utils/logger";
import type { HealthCheckResponse } from "../types/api.types";

const startTime = Date.now();

export const checkHealth = async (
  _req: Request,
  res: Response
): Promise<void> => {
  let dbOk = false;
  let redisOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    logger.error({ err }, "Health check: DB failed");
  }

  try {
    await redis.ping();
    redisOk = true;
  } catch (err) {
    logger.error({ err }, "Health check: Redis failed");
  }

  const allOk = dbOk && redisOk;

  const response: HealthCheckResponse = {
    status: allOk ? "ok" : "error",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    services: { db: dbOk, redis: redisOk },
  };

  res.status(allOk ? 200 : 503).json(response);
};
