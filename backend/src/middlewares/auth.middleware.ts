import { Request, Response, NextFunction } from "express";
import { getBuilderById } from "../services/builder.service";
import type { BuilderWithToken } from "../services/builder.service";
import logger from "../utils/logger";

export type AuthenticatedRequest = Request & {
  builder?: BuilderWithToken;
};

export const authenticateBuilder = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token =
      (req.headers["x-builder-token"] as string) || (req.query.token as string);

    if (!token) {
      res.status(401).json({ success: false, error: "Missing builder token" });
      return;
    }

    const builder = await getBuilderById(token);

    if (!builder) {
      res.status(403).json({ success: false, error: "Invalid token" });
      return;
    }

    if (!builder.isActive) {
      logger.warn(
        { builderId: builder.id },
        "⚠️ Inactive builder attempted access"
      );
      res
        .status(403)
        .json({ success: false, error: "Builder account is inactive" });
      return;
    }

    req.builder = builder;
    next();
  } catch (error) {
    logger.error({ error }, "❌ Authentication failed");
    res.status(500).json({ success: false, error: "Internal auth error" });
  }
};
