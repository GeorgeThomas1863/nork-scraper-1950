import express from "express";
import { apiEndpointController } from "../controllers/api-controller.js";

const router = express.Router();

router.post(process.env.API_SCRAPER, apiEndpointController);

export default router;
