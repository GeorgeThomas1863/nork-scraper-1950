import express from "express";
import { apiEndpointController } from "../controllers/api-controller.js";

const router = express.Router();
const apiScraperRoute = getValidatedApiScraperRoute();

router.post(apiScraperRoute, apiEndpointController);

export default router;

//---

function getValidatedApiScraperRoute() {
  const apiScraperRoute = process.env.API_SCRAPER;
  const isValidRoute =
    typeof apiScraperRoute === "string" &&
    apiScraperRoute === apiScraperRoute.trim() &&
    apiScraperRoute.startsWith("/");

  if (!isValidRoute) {
    throw new Error(
      'Invalid API_SCRAPER configuration: expected a path starting with "/"',
    );
  }

  return apiScraperRoute;
}
