import process from "node:process";
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
  // Server
  PORT: z.string().default("5000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database (Neon)
  DATABASE_URL: z.string().refine(urlCheck, "Invalid DATABASE_URL"),
  DIRECT_URL: z.string().refine(urlCheck, "Invalid DIRECT_URL"),

  // WhatsApp (Meta)
  WHATSAPP_APP_SECRET: z.string().min(1, "WHATSAPP_APP_SECRET is required"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, "WHATSAPP_VERIFY_TOKEN is required"),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, "WHATSAPP_ACCESS_TOKEN is required"),
  WHATSAPP_PHONE_NUMBER_ID: z
    .string()
    .min(1, "WHATSAPP_PHONE_NUMBER_ID is required"),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z
    .string()
    .min(1, "WHATSAPP_BUSINESS_ACCOUNT_ID is required"),
  META_API_VERSION: z.string().default("v19.0"),

  // AI & LangChain
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_PROJECT: z.string().optional(),
  LANGCHAIN_TRACING_V2: z.string().optional(),

  // Redis & BullMQ (Upstash TCP URL)
  REDIS_URL: z.string().min(1, "REDIS_URL (TCP) is required for BullMQ"),

  // Storage (Cloudflare R2 / Local MinIO)
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  // Security
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64, "Must be 64 hex chars (32 bytes)"),

  // Monitoring
  SENTRY_DSN: z.string().refine(urlCheck, "Invalid SENTRY_DSN").optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.issues);
  process.exit(1);
}

export const env = parsed.data;
