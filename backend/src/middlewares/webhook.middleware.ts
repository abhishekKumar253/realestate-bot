import type { Request, Response, NextFunction } from "express";
import * as crypto from "node:crypto";
import { env } from "../config/index";
import logger from "../utils/logger";

export const verifyWebhook = (req: Request, res: Response): void => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    logger.info("✅ Webhook verified successfully");
    res.status(200).send(challenge);
    return;
  }

  logger.warn("❌ Webhook verification failed");
  res.status(403).json({ error: "Forbidden" });
};

export const verifySignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!env.WHATSAPP_APP_SECRET) {
    logger.warn("⚠️ WHATSAPP_APP_SECRET not set - skipping verification");
    next();
    return;
  }

  const signature = req.headers["x-hub-signature-256"] as string;

  if (!signature) {
    logger.warn("❌ Missing signature header");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = JSON.stringify(req.body);
  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(body)
    .digest("hex")}`;

  if (signature !== expectedSignature) {
    logger.error("❌ Invalid signature - Potential spoofing attempt!");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();

}