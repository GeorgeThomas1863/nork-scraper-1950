import express from "express";

import CONFIG from "../config/config.js";
import { apiEndpointController } from "../controllers/api-controller.js";

const router = express.Router();

//api receive endpoint
router.post(CONFIG.apiScraper, apiEndpointController);

export default router;
