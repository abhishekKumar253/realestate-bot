import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import logger from "../utils/logger";

type Source = "body" | "query" | "params";

export const validate = <T extends z.ZodType>(
  schema: T,
  source: Source = "body"
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      logger.warn({ errors, source }, "Validation failed");
      res.status(400).json({ error: "Bad Request", details: errors });
      return;
    }

    req[source] = result.data;
    next();
  };
};
