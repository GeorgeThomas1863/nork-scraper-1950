//CURRENT STEP: DOWNLOAD VIDS KCNA, download pics seems to work

//ADD THE SCRAPE STOP LOGIC / CHECK TO EVERYTHING

import CONFIG from "./config/config.js";
import express from "express";
import cors from "cors";

import routes from "./routes/router.js";
import { dbConnect } from "./config/db.js";

// import { scrapeNewKCNA } from "./src/scrape-control.js";

//FIRST CONNECT TO DB
await dbConnect();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:" + CONFIG.displayPort],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(routes);

//PORT to listen
app.listen(CONFIG.scrapePort);
