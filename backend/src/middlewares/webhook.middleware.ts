import type { Request, Response, NextFunction } from "express";
import * as crypto from "node:crypto";
import { env } from "../config/env";
import logger from "../utils/logger";

export const verifySignature = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const signature = req.headers["x-hub-signature-256"] as string;

  if (!signature) {
    logger.warn("❌ Missing signature header");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!req.rawBody) {
    logger.warn("❌ No raw body available (Check express.json verify flag)");
    res.status(500).json({ error: "Internal configuration error" });
    return;
  }

  const actualSig = signature.replace("sha256=", "");
  const expectedSig = crypto
    .createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(req.rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(actualSig, "hex");
  const expBuf = Buffer.from(expectedSig, "hex");

  if (
    sigBuf.length !== expBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expBuf)
  ) {
    logger.error("❌ Invalid signature — potential spoofing attempt");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
