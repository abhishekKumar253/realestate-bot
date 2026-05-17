import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import { verifyWebhook, verifySignature } from "../src/middlewares/webhook.middleware";
import * as crypto from "node:crypto";

// ========== Test App Setup ==========
const app = express();
app.use(express.json({
  verify: (_req: any, _res, buf) => {
    _req.rawBody = buf.toString();
  },
}));

app.get("/webhook", verifyWebhook);
app.post("/webhook", verifySignature, (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ========== Mock Env ==========
vi.mock("../src/config/index", () => ({
  env: {
    WHATSAPP_VERIFY_TOKEN: "test_verify_token",
    WHATSAPP_APP_SECRET: "test_app_secret",
    NODE_ENV: "test",
  },
}));

vi.mock("../src/utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ========== Helper: Generate Signature ==========
const generateSignature = (body: string, secret: string): string => {
  return `sha256=${crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;
};

// ========== Tests ==========
describe("Webhook Middleware", () => {

  // ===== GET — Verification Tests =====
  describe("GET /webhook - verifyWebhook", () => {
    it("should return challenge when token matches", async () => {
      const res = await request(app)
        .get("/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "test_verify_token",
          "hub.challenge": "test_challenge_123",
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe("test_challenge_123");
    });

    it("should return 403 when token does not match", async () => {
      const res = await request(app)
        .get("/webhook")
        .query({
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong_token",
          "hub.challenge": "test_challenge_123",
        });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden" });
    });

    it("should return 403 when mode is not subscribe", async () => {
      const res = await request(app)
        .get("/webhook")
        .query({
          "hub.mode": "unsubscribe",
          "hub.verify_token": "test_verify_token",
          "hub.challenge": "test_challenge_123",
        });

      expect(res.status).toBe(403);
    });
  });

  // ===== POST — Signature Tests =====
  describe("POST /webhook - verifySignature", () => {
    const testBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [],
    });

    it("should return 200 when signature is valid", async () => {
      const signature = generateSignature(testBody, "test_app_secret");

      const res = await request(app)
        .post("/webhook")
        .set("x-hub-signature-256", signature)
        .set("Content-Type", "application/json")
        .send(testBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ok" });
    });

    it("should return 401 when signature is missing", async () => {
      const res = await request(app)
        .post("/webhook")
        .set("Content-Type", "application/json")
        .send(testBody);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });

    it("should return 401 when signature is invalid", async () => {
      const res = await request(app)
        .post("/webhook")
        .set("x-hub-signature-256", "sha256=invalidsignature")
        .set("Content-Type", "application/json")
        .send(testBody);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
    });
  });
});