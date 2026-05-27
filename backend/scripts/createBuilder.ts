import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as crypto from "node:crypto";

dotenv.config();

const encryptToken = (plainToken: string): string => {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (keyHex?.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainToken, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    encrypted: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  });
};

// ========== CLI Arguments ==========
const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const businessName = getArg("--name");
const phoneNumberId = getArg("--phoneNumberId");
const accessToken = getArg("--accessToken");
const wabaId = getArg("--wabaId");
const verifyToken = getArg("--verifyToken");
const phoneNumber = getArg("--phone");
const systemPrompt = getArg("--systemPrompt") ?? null;

if (!businessName || !phoneNumberId || !accessToken || !wabaId || !verifyToken || !phoneNumber) {
  console.error(`
❌ Missing required arguments.

Usage:
  npx tsx scripts/createBuilder.ts \\
    --name "Gupta Properties" \\
    --phoneNumberId "123456789" \\
    --accessToken "EAAxxxxx" \\
    --wabaId "987654321" \\
    --verifyToken "gupta_secret_123" \\
    --phone "+919876543210"

Optional:
    --systemPrompt "Custom AI instructions for this builder"
  `);
  process.exit(1);
}

const main = async () => {
  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    console.error("❌ DIRECT_URL or DATABASE_URL not set");
    process.exit(1);
  }

  // Use DIRECT_URL for scripts — avoids pooler issues
  if (process.env.DIRECT_URL) {
    process.env.DATABASE_URL = process.env.DIRECT_URL;
  }

  const prisma = new PrismaClient();

  try {
    const existing = await prisma.builder.findUnique({
      where: { phoneNumberId },
    });

    if (existing) {
      console.log(`⚠️  Builder already exists: ${existing.businessName} (${existing.id})`);
      return;
    }

    const encryptedToken = encryptToken(accessToken);

    const builder = await prisma.builder.create({
      data: {
        businessName,
        phoneNumberId,
        encryptedToken,
        wabaId,
        verifyToken,
        phoneNumber,
        systemPrompt,
        isActive: true,
      },
    });

    console.log("✅ Builder created successfully:");
    console.log(`   ID:           ${builder.id}`);
    console.log(`   Business:     ${builder.businessName}`);
    console.log(`   Phone:        ${builder.phoneNumber}`);
    console.log(`   PhoneNumId:   ${builder.phoneNumberId}`);
    console.log(`   Active:       ${builder.isActive}`);
  } catch (error) {
    console.error("❌ Failed to create builder:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();