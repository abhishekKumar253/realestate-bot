import { Router } from "express";
// import { verifySignature } from "../middlewares/webhook.middleware";
import {
  handleVerification,
  handleIncoming,
} from "../controllers/webhook.controller";

const router = Router();

// ========== GET — Meta Webhook Verification ==========
router.get("/", handleVerification);

// ========== POST — Incoming Messages ==========
router.post("/", handleIncoming);

export default router;