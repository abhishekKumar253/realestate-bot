import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import logger from "../utils/logger";

export const rateLimiter = (
  maxRequests: number = 100,
  windowSeconds: number = 900
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    const key = `rl:${ip}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) await redis.expire(key, windowSeconds);

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader(
        "X-RateLimit-Remaining",
        Math.max(0, maxRequests - current)
      );

      if (current > maxRequests) {
        logger.warn({ ip }, "Rate limit exceeded");
        res.status(429).json({ success: false, error: "Too many requests" });
        return;
      }

      next();
    } catch (error) {
      logger.error({ error, ip }, "Redis rate limit failed, allowing request");
      next();
    }
  };
};
