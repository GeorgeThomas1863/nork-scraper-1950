//CURRENT STEP: KCNA SCRAPE FULLY WORKING, NOW ADD IN STOP MECHANISM

//TODO:

//SEND BACK STATUS ITEMS TO DISPLAYER; BUILD ROUTE LISTENER ON DISPLAYER

//GET NAENARA PICS

//GET WATCH PICS

import CONFIG from "./config/config.js";
import express from "express";
import cors from "cors";

import routes from "./routes/router.js";
import { dbConnect } from "./config/db.js";

//FIRST CONNECT TO DB
await dbConnect();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  cors({
    origin: [`http://localhost:${CONFIG.displayPort}`],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(routes);

//PORT to listen
app.listen(CONFIG.scrapePort);
