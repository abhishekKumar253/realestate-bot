import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";
import * as crypto from "node:crypto";

dotenv.config();

neonConfig.webSocketConstructor = ws;

// ========== Encryption (same logic as crypto.ts) ==========
const getKey = (): Buffer => {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (key?.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(key, "hex");
};

const encryptToken = (plainToken: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);

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

// ========== Builder Data — Yahan fill karo ==========
const BUILDER = {
  businessName: "Rajdhani Homes",
  phoneNumberId: "1140190562507844",
  accessToken: "APNA_META_ACCESS_TOKEN_YAHAN_DAALO",
  wabaId: "2380602745684108",
  verifyToken: "ranchi_bot_secret_123",
  phoneNumber: "+919508401018",
  systemPrompt: null,
};

// ========== Main ==========
const main = async () => {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });

  const prisma = new PrismaClient({ adapter });

  try {
    // Check if already exists
    const existing = await prisma.builder.findUnique({
      where: { phoneNumberId: BUILDER.phoneNumberId },
    });

    if (existing) {
      console.log(`⚠️  Builder already exists: ${existing.businessName} (${existing.id})`);
      console.log("Agar update karna hai toh script mein upsert use karo.");
      return;
    }

    const encryptedToken = encryptToken(BUILDER.accessToken);

    const builder = await prisma.builder.create({
      data: {
        businessName: BUILDER.businessName,
        phoneNumberId: BUILDER.phoneNumberId,
        encryptedToken,
        wabaId: BUILDER.wabaId,
        verifyToken: BUILDER.verifyToken,
        phoneNumber: BUILDER.phoneNumber,
        systemPrompt: BUILDER.systemPrompt,
        isActive: true,
      },
    });

    console.log("✅ Builder created successfully:");
    console.log(`   ID:           ${builder.id}`);
    console.log(`   Business:     ${builder.businessName}`);
    console.log(`   Phone Number: ${builder.phoneNumber}`);
    console.log(`   Active:       ${builder.isActive}`);
  } catch (error) {
    console.error("❌ Failed to create builder:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();