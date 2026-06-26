import { Router } from "express";
import {
  handleVerification,
  handleIncoming,
} from "../controllers/webhook.controller";
// import { verifySignature } from "../middlewares/webhook.middleware";

const router = Router();

router.get("/webhook", handleVerification);
router.post("/webhook",  handleIncoming);

export default router;
