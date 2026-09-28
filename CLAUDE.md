# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Important: You are the orchestrator. subagents execute. you should NOT build, verify, or code inline (if possible). your job is to plan, prioritize & coordinate the actions of your subagents

Keep your replies extremely concise and focus on providing necessary information.

Put all pictures / screenshots you take with the mcp plugin in the "pics" subfolder, under the .claude folder in THIS project.

Do NOT commit anything to GitHub. The user will control all commits to GitHub. Do NOT edit or in any way change the user's Git history or interact with GitHub.

## Running the app

```bash
npm run dev                    # nodemon app.js (local dev)
npm test                       # vitest run
npx vitest run <pattern>       # run a single test file, e.g. npx vitest run articles
```

The app runs on `SCRAPE_PORT` (default 1951 per `.env`).

Production runs as the `scraper` service of the Docker Compose stack in `../nork-displayer-1950` (`npm run docker:up` there). Compose overrides `HOST=0.0.0.0`, `MONGO_URI=mongodb://mongo:27017`, and `PIC_PATH=/data/pics`; everything else comes from this repo's `.env`. No ports are published; the displayer reaches the scraper at `http://scraper:<SCRAPE_PORT><API_SCRAPER>`.

## Config

There is no `config/` directory. MongoDB connects in `middleware/db-config.js` using `MONGO_URI` and `DB_NAME`.

Environment variables live in `.env` (gitignored); `.env.example` is the reference list. Required vars:

```
SCRAPE_PORT=1951
SCRAPE_INTERVAL=3600000        # ms between scheduler runs

MONGO_URI=...
DB_NAME=nork-scraper
ARTICLES_COLLECTION=articles
PICSETS_COLLECTION=picSets
PICS_COLLECTION=pics
LOG_COLLECTION=log

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

Watch target (KCTV) vars. `WATCH_PATH` is required whenever `site=watch` is used; the rest have defaults:

```
WATCH_PATH=/path/to/watch-vids      # required for the watch target; where MP4s are written
WATCH_COLLECTION=watch             # MongoDB collection for KCTV bulletin entries
WATCH_PROFILE_PATH=                 # optional; defaults to ~/.playwright-profiles/kcnawatch
WATCH_HEADLESS=true                 # optional; default true
WATCH_BASE_URL=https://kcnawatch.org  # optional; default https://kcnawatch.org
VID_PROGRESS_SIZE=1048576           # log download progress every N bytes
TG_VID_CHUNK_BYTES=40000000         # optional; Telegram upload piece size (40 MB default)
```

`HOST` is optional and defaults to `127.0.0.1`; Docker Compose sets it to `0.0.0.0`.

## Tests

`tests/` holds one `.test.js` file per source module: api-controller, articles, db-model, kctv-listing, log, middleware/listen-host, nork-model, pics, picSets, repair-empty-pics, scheduler, scrape-kcna, scrape-watch, src, startup-config, tg-api, update-db, util, watch-vids. Shared HTML fixtures live in `tests/fixtures/`.

## Architecture

This is a Node.js/Express scraper (ESM modules) that pulls content from KCNA (kcna.kp) and posts it to a Telegram channel, storing everything in MongoDB.

**Request flow**: External POST to `API_SCRAPER` → `apiEndpointController` → `runScraper(inputParams)` → scrape pipeline

**Authentication**: Every POST body must include `password` matching `API_PASSWORD` env var, or a 401 is returned.

**Commands** sent in POST body `{ command, site, howMuch, password }`:
- `admin-start-scrape` / `admin-stop-scrape` — run a one-off scrape
- `admin-start-scheduler` / `admin-stop-scheduler` — periodic scraping via `setInterval` that runs KCNA and then sequentially the KCNA Watch video scrape each tick
- `admin-scrape-status` — returns current `kcnaState`

`site` values: `"kcna"` (default when absent) or `"watch"`. Only `admin-start-scrape` reads `site`; the scheduler always runs both KCNA and watch in sequence and does not read `site`.

`howMuch` values: `"admin-scrape-new"` (first page per category), `"admin-scrape-all"` (all pages), `"admin-scrape-url"` (a single supplied URL).

**URL definitions** (`src/util/define-things.js`): ~35-line file of hardcoded KCNA listing URLs, split into `articleURLs` and `picSetURLs` by category, plus the matching category display names. This drives what gets scraped.

**Scrape pipeline** (`src/kcna/scrape-kcna.js`), executed in order — wrapped in `try/catch/finally` so `logScrapeStopKCNA` always runs and `scrapeActive` is always reset to `false`, even on error:
1. Scrape article/picSet listing pages → extract URLs → store to MongoDB
2. Scrape individual article/picSet pages → extract content → store to MongoDB
3. Download pics to filesystem (`PIC_PATH/kcna_pic_{picId}.jpg`)
4. Update article/picSet docs with downloaded pic metadata
5. Upload articles + pic sets to Telegram (sorted oldest→newest)

**Watch target (KCTV)** (`src/watch/`): a second pipeline that pulls KCTV news bulletins from kcnawatch.org. `admin-start-scrape` with `site: "watch"` runs `scrapeWatch()` in `src/watch/scrape-watch.js` instead of `scrapeKCNA()`; both share `kcnaState`, the scrape log, and the `runScrapeStage` / `finalizeFailedScrape` helpers exported from `src/kcna/scrape-kcna.js`, so only one scrape of either kind can run at a time. Stages, in order:

1. `KCTV LISTING WATCH` — `scrapeKctvListing()` (`src/watch/kctv-listing.js`) reads the bulletin listing and returns entries for the 5pm and 8pm news only (`WATCH_VID_TYPES`). It throws if there are zero candidates or the profile is not logged in.
2. `KCTV UPLOAD WATCH` — `uploadVidPagesWatch(entryArray)` stores new entries in the `WATCH_COLLECTION` collection (`watch`).
3. `KCTV DOWNLOAD WATCH` — `downloadVidsWatch()` downloads the MP4s that have not been fetched yet.
4. `KCTV THUMBS WATCH` — `downloadThumbsWatch()` downloads thumbnails for all entries.
5. **Telegram upload** — After thumbnails, stage `KCTV TG UPLOAD WATCH` posts each new video to `TG_CHANNEL_ID`: one HTML header message, then the video split with ffmpeg stream copy into pieces under 50,000,000 bytes (Telegram bot upload limit) each posted as its own `sendVideo` message in order (caption on the first piece only); pieces are written to `WATCH_PATH/tg/` and deleted after a successful post; rows are marked `uploaded: true`, progress is kept in `telegramDelivery` so a failed run resumes; unmarked rows are retried next scrape. Optional env `TG_VID_CHUNK_BYTES` (default 40000000, i.e. 40 MB) sets the target piece size. Requires `ffmpeg` and `ffprobe` on PATH (installed in the Docker image; install locally for `npm run dev`).

Notes on how it works and why:

- **Listing needs a real browser.** kcnawatch.org runs a bot check, so the listing is scraped with Playwright driving a *persistent* Chrome profile: `channel: "chrome"`, `ignoreDefaultArgs: ["--enable-automation"]`, and `--disable-blink-features=AutomationControlled`. Headless is controlled by `WATCH_HEADLESS` (default true).
- **One-time manual login required.** The profile at `WATCH_PROFILE_PATH` (default `~/.playwright-profiles/kcnawatch`) must be logged into kcnawatch.org by hand once, headed. After that the saved session carries the scrape. If the profile is logged out, stage 1 throws.
- **Video download needs no browser.** MP4s come straight from `streamer.nknews.org` over plain HTTP with a browser User-Agent and a kcnawatch Referer header. No cookies are involved.
- **Output**: files are written to `WATCH_PATH` as `kctv_<date>_<vidType>.mp4`; progress is logged every `VID_PROGRESS_SIZE` bytes.
- **Local only for now.** The Docker image has no Chrome, so the watch target cannot run in the container. Run it locally until Chrome is added to the image.

**State**: `kcnaState` in `src/util/state.js` is a module-level singleton. `scrapeActive` is checked throughout the pipeline — setting it to `false` stops the scrape mid-run. The scheduler stores `intervalId` at module scope (not in state) to avoid serialization issues.

**Key classes**:
- `dbModel` (`models/db-model.js`): MongoDB wrapper. Instantiated per-operation with `(dataObject, collectionName)`. Collections are named via `process.env`. Does **not** call `dbConnect()` at import — connection is established once at startup in `app.js`.
- `NORK` (`models/nork-model.js`): Simple HTTP fetcher using axios with `getHTML()`. Returns null on error.

**TG API** (`src/tg-api.js`): Supports multiple bot tokens. `TOKEN_ARRAY` env var holds comma-separated names of other env vars, which are resolved to actual tokens at startup. On rate-limit (429) or failure, rotates to next token via `tokenIndex++`. Photos are uploaded from filesystem using `form-data`.

**Dedup**: Articles and picSets are deduped by URL before storing. `findEmptyItems()` finds docs that have a URL but are missing content/upload flags, driving the content-scrape and upload steps.

**`picArray` structure**: Articles and picSets store pic URLs as a plain string array initially. After download, `updatePicDataKCNA()` replaces each URL string with the full pic doc object from the `pics` collection (which includes `savePath`, `picSize`, etc.).
