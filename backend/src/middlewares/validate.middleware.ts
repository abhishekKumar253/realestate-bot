import type { Request, Response, NextFunction } from "express";
import { ZodType, ZodError } from "zod";
import logger from "../utils/logger";

export const validate =
  (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors =
        result.error instanceof ZodError
          ? result.error.issues.map((issue) => ({
              field: issue.path.join("."),
              message: issue.message,
            }))
          : [{ field: "unknown", message: "Validation failed" }];

      logger.warn({ errors }, "❌ Validation failed");
      res.status(400).json({ error: "Bad Request", details: errors });
      return;
    }

    req.body = result.data;
    next();
  };
