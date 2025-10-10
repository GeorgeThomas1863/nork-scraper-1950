import express from "express";

import CONFIG from "../config/config.js";
import { apiReceiveController, apiSendController } from "../controllers/api-controller.js";

const router = express.Router();

router.post(CONFIG.apiScraperReceiveRoute, apiReceiveController);
router.post(CONFIG.apiScraperSendRoute, apiSendController);

// router.post("/nork", apiIncomingRoute);

export default router;
