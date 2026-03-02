import express from "express";
import routes from "./routes/router.js";
import { dbConnect } from "./middleware/db-config.js";

try {
  await dbConnect();
} catch (e) {
  console.error("Failed to connect to MongoDB:", e.message);
  process.exit(1);
}

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(routes);

app.listen(process.env.SCRAPE_PORT);
