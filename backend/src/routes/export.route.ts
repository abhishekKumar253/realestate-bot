import { Router } from "express";
import { exportLeads } from "../controllers/export.controller";

const router = Router();

router.get("/leads", exportLeads);

export default router;
