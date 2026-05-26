import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as dotenv from "dotenv";
import * as crypto from "node:crypto";

dotenv.config();

neonConfig.webSocketConstructor = ws;

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

const main = async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const newToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!newToken) {
    console.error("WHATSAPP_ACCESS_TOKEN environment variable is required");
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter });

  const PHONE_NUMBER_ID = "1140190562507844";

  const builder = await prisma.builder.findUnique({
    where: { phoneNumberId: PHONE_NUMBER_ID },
  });

  if (!builder) {
    console.log("❌ Builder not found");
    await prisma.$disconnect();
    return;
  }

  const encrypted = encryptToken(newToken);
  await prisma.builder.update({
    where: { id: builder.id },
    data: { encryptedToken: encrypted },
  });

  console.log(`✅ Token updated for ${builder.businessName}`);
  await prisma.$disconnect();
};

main();