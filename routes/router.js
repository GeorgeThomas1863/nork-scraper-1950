import express from "express";

import CONFIG from "../config/config.js";
import { apiIncomingController, apiOutgoingController } from "../controllers/api-controller.js";

const router = express.Router();

router.post(CONFIG.apiIncomingRoute, apiIncomingController);
router.post(CONFIG.apiOutgoingRoute, apiOutgoingController);

// router.post("/nork", apiIncomingRoute);

export default router;
