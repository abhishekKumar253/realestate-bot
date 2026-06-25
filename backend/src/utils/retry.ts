import logger from "./logger";

export const withRetry = async <T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000,
  label: string = "operation"
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn(
        { attempt, retries, label },
        `⚠️ Retry ${attempt}/${retries}`
      );
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError;
};
