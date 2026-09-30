# Runbook: articleType → articleTypeArray migration

One-time production procedure. Articles move from a single `articleType` string to an `articleTypeArray` list. Duplicate articles are merged, and categories are backfilled from KCNA's category archives.

The migration script is `scripts/migrate-article-types.js`. It is a **dry run unless `--execute` is passed**, and every phase is safe to re-run. It writes its output files to `--out <dir>` inside the container (default `/tmp/article-type-migration`) and prints the full path of each file.

Production layout:
- Compose project `nork`, compose file `/var/www/nork/displayer/docker-compose.yml`.
- Services `scraper`, `displayer`, `mongo`. Containers `nork-scraper-1`, `nork-displayer-1`, `nork-mongo-1`.
- Database `kcna`, collection `articles`.

Run every command below from `/var/www/nork/displayer`.

Shorthand used below:

```bash
MIGRATE="docker exec nork-scraper-1 node scripts/migrate-article-types.js"
```

---

## 1. Stop the scheduler and make sure no scrape is running

The scheduler state lives only in memory.

1. On the displayer admin page, send command `stop-scheduler` (target `kcna`).
2. Send `scrape-status` and confirm that no scrape is active. If one is running, send `stop-scrape` and wait until `scrape-status` shows it has stopped.
3. Check that the logs are quiet:
   ```bash
   docker logs --since 5m nork-scraper-1 | tail -50
   ```

Note: rebuilding the scraper in step 3 restarts it. Check that the scheduler is still off after the restart (`scrape-status`), and stop it again if it came back on.

## 2. Full database backup

Run your mongodump wrapper, or run mongodump directly:

```bash
mkdir -p backups
docker compose -p nork exec -T mongo mongodump --archive --db kcna > "backups/nork-mongo-pre-article-types-$(date +%F).archive"
ls -lh backups/nork-mongo-pre-article-types-*.archive
```

Confirm the archive is not empty and its size is in line with earlier backups. Do not continue until it is.

## 3. Deploy the new scraper and displayer code

1. The user pushes both repos.
2. On the server, pull both:
   ```bash
   git -C /var/www/nork/scraper pull
   git -C /var/www/nork/displayer pull
   ```
3. Rebuild and restart both images:
   ```bash
   docker compose -p nork up -d --build scraper displayer
   ```
4. Re-check that the scheduler is off (see step 1).

**Run step 4 immediately.** Until `seed` runs, the displayer's category views are empty, because the displayer now filters on `articleTypeArray`.

## 4. `seed`: copy each `articleType` into `articleTypeArray` and create the new index

```bash
$MIGRATE seed
```

Review the output: the counts per `articleType`, how many docs each type would be added to, and "DOCS THAT WOULD STILL BE MISSING articleTypeArray" (this must be 0).

```bash
$MIGRATE seed --execute
```

The output must end with `SEED COMPLETE` and show "DOCS STILL MISSING articleTypeArray: 0". Category views in the displayer work again from this point.

## 5. `merge`: merge duplicate articles

```bash
$MIGRATE merge
```

Review the output:
- The groups found, how many are mergeable, and how many docs would be deleted. On the 2026-09-29 snapshot this was about 631 groups merged and about 825-835 docs deleted.
- **The skipped groups (text differs)**, about 4 of them. Each shows its title, date, articleIds, URLs and text lengths. These are never merged automatically. Decide on them by hand.
- `<out>/merge-plan-<timestamp>.json` lists, for every group, the keeper, the docs to delete, and the union of categories.

```bash
$MIGRATE merge --execute
```

Before deleting anything, the script writes `<out>/merge-preimage-<timestamp>.json`. This file holds the full original docs that get deleted plus the keeper docs as they were before the update, in canonical Extended JSON. If that write fails, the script aborts and deletes nothing.

Copy the preimage out of the container right away, because `/tmp` in the container is lost when the container is recreated:

```bash
docker exec nork-scraper-1 ls -l /tmp/article-type-migration/
docker cp nork-scraper-1:/tmp/article-type-migration/. backups/article-type-migration/
ls -lh backups/article-type-migration/merge-preimage-*.json
```

## 6. `backfill`: tag existing articles from KCNA's category archives

The backfill only adds categories to articles that are already in the database. It never inserts articles. It is slow on purpose: 60 s timeout per request, up to 4 retries with backoff, and a 2.5 s delay between requests. The "top" category alone is about 36 pages, and all 10 categories are several hundred pages. Run it in a detached shell such as `tmux` or `screen`.

1. Dry run for one category. This fetches KCNA but writes nothing to the database:
   ```bash
   $MIGRATE backfill --category top
   ```
   Review the summary line: pages done/failed, links seen, matched by URL, matched by title, types that would be added, unmatched, ambiguous. The detailed unmatched and ambiguous lists are in `<out>/backfill-report-top.json`. The dry run keeps its own progress file (`backfill-progress-dry-run-top.json` here, or `backfill-progress-dry-run.json` for a dry run of all categories), so it never makes the real run skip pages.

2. Real run, all categories:
   ```bash
   $MIGRATE backfill --execute
   ```
   After each page it saves progress to `<out>/backfill-progress.json`. Progress stops advancing at the first failed page in the run: later pages and categories still run, but the file stays at the last good page before the failure. If the run is interrupted or has failed pages, run the same command again and it continues from the first failed page (re-tagging pages that are already done is harmless). To start over, delete that file.

3. Re-run failed pages. The final summary lists failed pages per category and the script exits with code 1 if there were any. For each one, run:
   ```bash
   $MIGRATE backfill --execute --category <type> --from-page <N>
   ```
   `--from-page` continues from page N to the last page. Re-running pages that are already tagged is harmless. A `--from-page` run keeps no progress file at all, and a `--category` run without `--from-page` keeps its own file (`backfill-progress-<type>.json`), so neither changes the full run's `backfill-progress.json`.

4. Copy the reports out:
   ```bash
   docker cp nork-scraper-1:/tmp/article-type-migration/. backups/article-type-migration/
   ```

## 7. Verify

Counts per category:

```bash
docker exec nork-mongo-1 mongosh kcna --quiet --eval '
  db.articles.aggregate([{ $unwind: "$articleTypeArray" }, { $group: { _id: "$articleTypeArray", count: { $sum: 1 } } }, { $sort: { count: -1 } }]).toArray()'
```

Top, home, documents, society and external should now have recent articles:

```bash
docker exec nork-mongo-1 mongosh kcna --quiet --eval '
  for (const t of ["top","home","documents","society","external"]) {
    const d = db.articles.find({ articleTypeArray: t }).sort({ date: -1 }).limit(1).toArray()[0];
    print(t, d ? d.dateNormal : "NONE");
  }'
```

No article may be missing `articleTypeArray` (must print 0):

```bash
docker exec nork-mongo-1 mongosh kcna --quiet --eval '
  db.articles.countDocuments({ $or: [{ articleTypeArray: { $exists: false } }, { articleTypeArray: { $size: 0 } }] })'
```

In the displayer:
- Each category button (Top News, Home, Documents, Social Life, External, and so on) shows articles, including recent ones.
- Article cards show several categories where an article is in more than one.

## 8. `finalize`: remove the old field and index

Run this only after the displayer is deployed and verified (step 7).

```bash
$MIGRATE finalize
```

The dry run checks that every article has a non-empty `articleTypeArray`. If any do not, it aborts and lists them. Otherwise it reports how many docs would lose `articleType`.

```bash
$MIGRATE finalize --execute
```

This unsets `articleType` on all articles, drops index `articleType_1_date_-1_articleId_-1` (an already-missing index counts as done), and prints the counts per category.

## 9. Scheduler

Turn the scheduler back on **only if the user asks**. To do it, send `start-scheduler` (target `kcna`) from the admin page. Then watch one scrape:

```bash
docker logs -f nork-scraper-1 | grep -E "ADDED TYPE|STORED ARTICLE URL|ERROR"
```

Expect "ADDED TYPE <type> TO EXISTING ARTICLE <url>" lines when an already-stored article shows up in another category's list.

---

## Rollback

- **Full rollback:** restore the step-2 mongodump. Stop the scraper first so nothing writes during the restore:
  ```bash
  docker compose -p nork stop scraper displayer
  docker compose -p nork exec -T mongo mongorestore --archive --drop --nsInclude "kcna.*" < backups/nork-mongo-pre-article-types-<date>.archive
  ```
  Then redeploy the previous scraper and displayer code, because the new code expects `articleTypeArray`.
- **Narrow rollback of the merge only:** `backups/article-type-migration/merge-preimage-<timestamp>.json` holds the deleted docs (`deleteDocArray`) and the pre-merge keepers (`keeperDocArray`) in canonical Extended JSON, with `_id`, dates and number types preserved. Re-insert the deleted docs and replace the keepers from this file, for example with a short mongosh script using `EJSON.parse`.
