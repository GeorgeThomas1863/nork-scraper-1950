//ADD WATCHDOG STOP TO END OF SCRAPE, MAKE STOP MORE ROBUST

//CLEAN THE TMP FOLDER ON SCRAPE STOP / END

//---------------

//SEND BACK STATUS ITEMS TO DISPLAYER; BUILD ROUTE LISTENER ON DISPLAYER

//GET NAENARA PICS

//GET WATCH PICS

import CONFIG from "./config/config.js";
import express from "express";

import routes from "./routes/router.js";
import { dbConnect } from "./config/db.js";

//FIRST CONNECT TO DB
await dbConnect();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(routes);

//PORT to listen
app.listen(CONFIG.scrapePort);
