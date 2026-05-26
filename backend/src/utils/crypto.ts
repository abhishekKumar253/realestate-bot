import crypto from "node:crypto";
import { env } from "../config/index";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "hex"); // 32 bytes

// ─── Encrypt ─────────────────────────────────────────────────────────────────
export const encryptToken = (plainToken: string): string => {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

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

// ─── Decrypt ─────────────────────────────────────────────────────────────────
export const decryptToken = (encryptedJson: string): string => {
  const { encrypted, iv, authTag } = JSON.parse(encryptedJson) as {
    encrypted: string;
    iv: string;
    authTag: string;
  };

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};