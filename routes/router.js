import express from "express";

import CONFIG from "../config/config.js";
import { apiEndpointController, apiSendController } from "../controllers/api-controller.js";

const router = express.Router();

//api receive endpoint
router.post(CONFIG.apiScraper, apiEndpointController);

//send data to displayer
router.post("/send-data-route", apiSendController);

// router.post("/nork", apiIncomingRoute);

export default router;
