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
