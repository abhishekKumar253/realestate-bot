import type { Request, Response, NextFunction } from "express";
import * as crypto from "node:crypto";
import { env } from "../config/index";
import logger from "../utils/logger";

export const verifySignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!env.WHATSAPP_APP_SECRET) {
    logger.warn("⚠️ WHATSAPP_APP_SECRET not set — skipping verification");
    next();
    return;
  }

  const signature = req.headers["x-hub-signature-256"] as string;

  if (!signature) {
    logger.warn("❌ Missing signature header");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!req.rawBody) {
    logger.warn("❌ No raw body available");
    res.status(500).json({ error: "Internal configuration error" });
    return;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(req.rawBody)
    .digest("hex")}`;

  // Timing-safe comparison
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    logger.error("❌ Invalid signature — potential spoofing attempt");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};