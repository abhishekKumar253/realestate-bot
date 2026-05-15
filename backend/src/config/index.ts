import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const urlCheck = (val: string) => {
  try {
    new URL(val);
    return true;
  } catch {
    return false;
  }
};

const envSchema = z.object({
  PORT: z.string().default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),

  DATABASE_URL: z.string().refine(urlCheck, "Invalid DATABASE_URL"),
  DIRECT_URL: z.string().refine(urlCheck, "Invalid DIRECT_URL"),

  OPENAI_API_KEY: z.string().optional(),

  SENTRY_DSN: z.string().refine(urlCheck, "Invalid SENTRY_DSN").optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;