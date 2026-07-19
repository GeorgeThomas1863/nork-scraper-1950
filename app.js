import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const { default: express } = await import("express");
const { default: routes } = await import("./routes/router.js");
const { dbConnect } = await import("./middleware/db-config.js");

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

app.listen(process.env.SCRAPE_PORT, () =>
  console.log(`Scraper running on port ${process.env.SCRAPE_PORT}`)
);
