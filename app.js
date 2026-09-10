import dotenv from "dotenv";
import { resolveListenHost } from "./middleware/listen-host.js";

dotenv.config({ path: ".env" });

const { default: express } = await import("express");
const { default: routes } = await import("./routes/router.js");
const { dbConnect } = await import("./middleware/db-config.js");
const { resumeSchedulerKCNA } = await import("./src/util/scheduler.js");
const { closeStaleScrapes } = await import("./src/util/log.js");

try {
  await dbConnect();
} catch (e) {
  console.error("Failed to connect to MongoDB:", e.message);
  process.exit(1);
}

await closeStaleScrapes();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(routes);

app.listen(process.env.SCRAPE_PORT, resolveListenHost(process.env.HOST), () =>
  console.log(`Scraper running on port ${process.env.SCRAPE_PORT}`)
);

try {
  await resumeSchedulerKCNA();
} catch (e) {
  console.error("Failed to resume scheduler:", e.message);
}
