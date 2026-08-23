# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

Important: You are the orchestrator. subagents execute. you should NOT build, verify, or code inline (if possible). your job is to plan, prioritize & coordinate the actions of your subagents

Keep your replies extremely concise and focus on providing necessary information.

Put all pictures / screenshots you take with the mcp plugin in the "pics" subfolder, under the .Codex folder in THIS project.

Do NOT commit anything to GitHub. The user will control all commits to GitHub. Do NOT edit or in any way change the user's Git history or interact with GitHub.

## Running the app

```bash
npm start                      # runs: nodemon app.js
npm test                       # runs: vitest (13 test files under tests/)
npx vitest run <pattern>       # run a single test file, e.g. npx vitest run articles
```

The app runs on `SCRAPE_PORT` (default 1951 per `.env`).

## Config setup

The `config/` directory is **gitignored** and stored in a separate private repo. Set it up via:

```bash
bash setup-config.sh <config-repo-url>
```

The config repo must export: `config/config.js` (main config), `config/db.js` (MongoDB connection), `config/urls.js` (KCNA page URLs), `config/tg-bot.js` (Telegram bot token array).

Environment variables are in `.env` (also gitignored). Required vars:

```
SCRAPE_PORT=1951
SCRAPE_INTERVAL=3600000        # ms between scheduler runs

MONGO_URI=...
DB_NAME=nork-scraper
ARTICLES_COLLECTION=articles
PICSETS_COLLECTION=picSets
PICS_COLLECTION=pics
LOG_COLLECTION=scrapeLog

KCNA_BASE_URL=http://www.kcna.kp

TG_CHANNEL_ID=-100...
TG_MAX_LENGTH=4096
TOKEN_ARRAY=BOT_TOKEN_1,BOT_TOKEN_2   # comma-separated names of bot token env vars
BOT_TOKEN_1=<token>
BOT_TOKEN_2=<token>

PIC_PATH=/path/to/pics
PIC_PROGRESS_SIZE=102400       # log download progress every N bytes

API_PASSWORD=<password>
API_SCRAPER=/api/scrape
```

## Architecture

This is a Node.js/Express scraper (ESM modules) that pulls content from KCNA (kcna.kp) and posts it to a Telegram channel, storing everything in MongoDB.

**Request flow**: External POST to `API_SCRAPER` → `apiEndpointController` → `runScraper(inputParams)` → scrape pipeline

**Authentication**: Every POST body must include `password` matching `API_PASSWORD` env var, or a 401 is returned.

**Commands** sent in POST body `{ command, howMuch, password }`:
- `admin-start-scrape` / `admin-stop-scrape` — run a one-off scrape
- `admin-start-scheduler` / `admin-stop-scheduler` — periodic scraping via `setInterval`
- `admin-scrape-status` — returns current `kcnaState`

`howMuch` values: `"admin-scrape-new"` (last 2 pages per category) or full scrape (all pages).

**URL definitions** (`src/util/define-things.js`): 1335-line file of hardcoded KCNA pagination URLs, split into `articleURLs` and `picSetURLs` by category. This drives what gets scraped.

**Scrape pipeline** (`src/kcna/scrape-kcna.js`), executed in order — wrapped in `try/catch/finally` so `logScrapeStopKCNA` always runs and `scrapeActive` is always reset to `false`, even on error:
1. Scrape article/picSet listing pages → extract URLs → store to MongoDB
2. Scrape individual article/picSet pages → extract content → store to MongoDB
3. Download pics to filesystem (`PIC_PATH/kcna_pic_{picId}.jpg`)
4. Update article/picSet docs with downloaded pic metadata
5. Upload articles + pic sets to Telegram (sorted oldest→newest)

**State**: `kcnaState` in `src/util/state.js` is a module-level singleton. `scrapeActive` is checked throughout the pipeline — setting it to `false` stops the scrape mid-run. The scheduler stores `intervalId` at module scope (not in state) to avoid serialization issues.

**Key classes**:
- `dbModel` (`models/db-model.js`): MongoDB wrapper. Instantiated per-operation with `(dataObject, collectionName)`. Collections are named via `process.env`. Does **not** call `dbConnect()` at import — connection is established once at startup in `app.js`.
- `NORK` (`models/nork-model.js`): Simple HTTP fetcher using axios with `getHTML()`. Returns null on error.

**TG API** (`src/tg-api.js`): Supports multiple bot tokens. `TOKEN_ARRAY` env var holds comma-separated names of other env vars, which are resolved to actual tokens at startup. On rate-limit (429) or failure, rotates to next token via `tokenIndex++`. Photos are uploaded from filesystem using `form-data`.

**Dedup**: Articles and picSets are deduped by URL before storing. `findEmptyItems()` finds docs that have a URL but are missing content/upload flags, driving the content-scrape and upload steps.

**`picArray` structure**: Articles and picSets store pic URLs as a plain string array initially. After download, `updatePicDataKCNA()` replaces each URL string with the full pic doc object from the `pics` collection (which includes `savePath`, `picSize`, etc.).
