import { Router } from "express";
import { exportLeads } from "../controllers/export.controller";
import { authenticateBuilder } from "../middlewares/auth.middleware";

const router = Router();

router.get("/leads", authenticateBuilder, exportLeads);

export default router;


