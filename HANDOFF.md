# HANDOFF — bettorday-api deploy cost

Operational record for what this project costs to deploy and the levers on it.
Keep it current as levers land. This repo is public, so dollar figures stay out
of it; they are on the Vercel Usage page. The key-rotation record below lives
here too, because the proxy is this project's code; key values never go in it.

## Odds API key rotation — swap Fri 11/6 (slid one week, Scott 2026-10-28)

The live Odds API key is inlined in six public tool pages. The fix is a
server-side proxy here (`api/odds/`, env `ODDS_API_KEY`), then the pages move
onto it, then the key is regenerated. The account is **regenerate-only**:
regenerating kills the old key instantly, so the swap and the revoke are one
sitting. The plan was approved 2026-10-26; this section is now its record.

**Schedule:**

| Day | What | Who |
|---|---|---|
| **Mon 11/2** | Morning: set `ODDS_API_KEY` in this project to the **current** key. Then push the proxy and curl-verify it, flip the six pages, push app main (PWA goes live) and cut + upload the rotation OTA | env + upload: Scott. Everything else: Claude |
| **Tue 11/3** | Ghost re-pastes alongside the normal Tuesday work: odds (with the NBA deep link), nfl, ncaaf, mlb, web-nfl-hq, web-cfb-hq (with the pure-live note), web-nba-hq. Check each in view-source: `the-odds-api` count is 0 | Scott |
| **Tue–Thu** | Soak. Check Capgo adoption of the rotation OTA and Odds API usage daily | both |
| **Thu 11/5** | Staging (below). In the evening, read Capgo adoption: go if ≥ ~90%, else the whole swap moves | both |
| **Fri 11/6** | Swap, 9:00–9:45 AM ET, **but see the DST conflict below**. Same ordered checklist as before | Scott, then Claude verifies |

**⚠️ DST conflict in the Friday window (open; Scott decides).** DST ends Sun
11/1. GitHub crons run on UTC, so on 11/6 every key-using run fires an hour
earlier on the ET clock than it did on 10/30. The original 9:00–9:45 EDT window
was 13:00–13:45 UTC. 9:00–9:45 **EST** is 14:00–14:45 UTC. That slot has:
- NBA props shadow at 9:00 and 9:30 (GitHub `0,30 14-23`). It also publishes the
  member-facing `nba_periods_latest.json`.
- MLB at 9:00 and 9:30, if the World Series is still running. The schedule is
  commented out the day after the final game (`bettorday-mlb-pipeline/HANDOFF.md`).
- NBA 1Q and NHL 1P +4h backups, plus NHL props, at 9:47. That is two minutes
  after the window closes.

The same quiet slot as originally planned is **8:00–8:45 AM EST**, with the
go/no-go at 7:55, after the 7:47 backups. This is the recommendation. The
cron-job.org trigger for the NBA shadow keeps its own timezone. Check it in its
dashboard either way.

**Friday checklist, in order** (new key on the clipboard, never in chat):

| # | Step | Done when |
|---|---|---|
| 0 | Go/no-go: today's NBA 1Q and NHL 1P runs are finished green in Actions | both green |
| 1 | Regenerate in the Odds API dashboard. The old key dies now; the proxy serves cached lines and then a `no-store` 502 until step 2 | new key copied |
| 2 | This project: edit `ODDS_API_KEY` in every scope it's in, then Deployments → latest Production → **Redeploy** | Ready |
| 3 | Apps Script: Script Property `ODDS_API_KEY` → Save (no redeploy once Thursday staging is done) | saved |
| 4 | GitHub secret `ODDS_API_KEY`: bettorday-mlb-pipeline, NFL-Trench-Report, NBA-HQ, NHL-HQ | all four "Updated now" |
| 5 | `printf %s "$NEW" \| shasum -a 256 \| cut -c1-16` → send Claude only the fingerprint | sent |

Then: Claude curls each proxy endpoint (200, fresh `as_of`, no key in the
body) and pushes the new `ODDS_EXPECT` to NBA-HQ `secrets_check`. Scott runs
`curl -s -o /dev/null -w "%{http_code}\n" "https://api.the-odds-api.com/v4/sports/?apiKey=$OLD"`
and expects 401, and 200 with `$NEW`. Each repo's next natural run proves its
secret. Times are EST if the window moves to 8:00: NBA props shadow 9:00, NHL
props 9:47, MLB 9:00 (if still in season; otherwise its secret is unproven
until spring), NFL props 3:17 PM. Struck: the chatbot (deleted).

**Thursday 11/5 staging (Scott):**
- Apps Script: if the key is a constant in `Code.gs`, move it to Script
  Property `ODDS_API_KEY` (still the old key). Then Deploy → Manage
  deployments → Edit → New version, and watch `Cache_Games` timestamps keep
  moving. **Still open from 10/26: is it a constant or a property?** Send the
  lines around it (key redacted) and Claude writes the change. This can be done
  any day before Thursday; earlier is better.
- Note which Vercel scopes hold `ODDS_API_KEY` (Production/Preview/Development).
- Open tabs: Odds API dashboard; this project's env vars and Deployments; Apps
  Script Script Properties; the four repos' `settings/secrets/actions`; NBA-HQ
  and NHL-HQ Actions.

**State as of 2026-10-28 (nothing has rotted, because nothing was built):**
- **The proxy does not exist yet.** There is no branch or commit for it in any
  repo. The 10/27 build day never ran, because the plan sat at approval. It
  has to be written and tested locally **before Monday morning**, so that
  Monday is push-and-verify. It ships with the `api/dnt.js` tombstone deletion
  (see "Next touch of `api/`").
- Key inventory, re-run on every repo's `origin/main`: unchanged from 10/26.
  The six pages, plus `resolveApiKey` in nfl/ncaaf, plus the hardcoded fallback
  in `bettorday-mlb-pipeline/mlb_pipeline.py:50` and `CLOUD_SETUP.md:56`
  (scrubbed Monday). There are no new consumers.
- The rotation OTA is **not 1.1.39**: 1.1.39–1.1.42 shipped since. It takes
  the next free number in `bettorday-app/WORKLIST.md`, claimed Monday before
  building. It carries the page flips, the odds `?sport=` deep link
  (+ `forwardSearch` on `/odds` in `App.tsx`), and branch
  `cfb-board-pure-live-note` (`59e16c6`). By Scott's call that branch rides the
  next OTA and paste round; it merges cleanly onto today's main.
- Capgo adoption restarts from Monday's OTA. The window to Thursday evening is
  about 3.5 days, against about 2.5 in the original plan.

**Knock-on:** levers C and D and the Blob migration below wait for the swap.
The Blob migration was "next week", which is now rotation week. Start it Mon
11/9 or later, so no routing or pipeline change lands on this project during
the soak.

## Diagnosis (2026-10-26)

Every commit to `main` is a Vercel production deploy. The feed pipelines commit
here around the clock, so deploy count is commit count.

**Build-count driver: the market feeds, NHL first.** Last 7 days, 3,059 commits
(~437/day):

| Source | Commits / 7 d | Share |
|---|---|---|
| NHL HQ market feed (content + heartbeat) | 1,670 | 55% |
| NFL HQ market feed (content + heartbeat) | 1,077 | 35% |
| NBA 1Q/1H live lines | 140 | 5% |
| Everything else (daily builds, MLB, CFB/NFL weekly) | ~170 | 5% |

Volume history: ~100/day in September, ~140 early October, ~600/day Oct 7–13,
~410/day since Oct 14.

**Builds are fast; the meter is not.** Measured from Vercel's GitHub commit
statuses (pending → success), 20 production builds on 2026-10-26: median
0.42 min, range 0.38–0.57. Vercel rounds each build up to a whole minute and
multiplies by the machine's vCPUs. ~10k builds × 1 min × 4 vCPU (Elastic was
assigning Standard) matches the usage page's 632 h for the period. So the build
bill is *count × rounding × machine size*, not slow builds.

Build logs (Scott, 2026-10-27) confirm it: `Build machine configuration: 4 cores,
8 GB`. Of a 24 s build, **16.3 s is cloning** the repo and `vercel build` takes
~1 s. After lever A: clone 15.4 s, 21 s total, "Removed 275 ignored files".
`.vercelignore` removes files *after* the clone, so clone time only shrinks
when the dated archives leave the deployed tree (the Blob migration). Watch
it anyway: a clone past 60 s bills 2 minutes per build.

**Storage driver: dated MLB archives.** Each deploy carried 157 MB in 383
files; 207 `public/mlb/game_center_<date>.json` files were 145 MB of it.
Nothing member-facing reads them (the MLB tool reads `mlb/latest.json`).
`api/mlb/games.js` reads by a variable path, which makes Vercel's file tracing
pack the directory into its function bundle as well. 1.74 TB of deployment
storage ≈ 11k deploys × 157 MB, kept under the Pro default production
retention of one year.

## Levers

| Lever | Status | Measured effect |
|---|---|---|
| Retention policy (Settings → Security) | **set by Scott 10/27**: Canceled 1 day, Errored 1 week, Pre-Production 1 week, Production 1 day | _storage before/after: Scott sends Usage ~10/29_ |
| Build machine Standard, Elastic off; On-Demand Concurrent Builds off | **set by Scott 10/27** | _build hours before/after: Scott sends Usage ~10/29_. Per Vercel pricing, Standard builds are unbilled with Elastic and on-demand both off; the Git branch queue now skips superseded commits |
| A: `.vercelignore` drops dated MLB archives | **live 10/27 00:05 UTC** (`373e00e`) | payload 157 MB / 383 files → 12.4 MB / 108 files (−92%). Build 0.42 min median → 0.35–0.37 min; still bills as 1 min, so the gain is storage, not build hours |
| C: heartbeat trim | after the Fri 11/6 key swap | ~48 commits/day are timestamp-only heartbeats |
| D: collector batching | after the Fri 11/6 key swap | one push per 10 min across feeds ≈ 437 → ~142/day (simulated) |
| MLB offseason shutdown | after the final World Series game | see `bettorday-mlb-pipeline/HANDOFF.md` |
| Blob migration (URLs unchanged) | from Mon 11/9 (after the swap) | see below |

### Lever A behaviour

`/api/mlb/games?date=<any>` finds no dated file and falls back to
`latest.json`, whose own `date` field names the day served. Verified locally
on 2026-10-26: no date, a past date, today, a future date and a traversal
attempt all return 200 with `latest.json`. That was already the behaviour for
any date without a file. Direct URLs `/mlb/game_center_<date>.json` and
`/mlb/ballparkpal_<date>.json` now 404; nothing in the repos reads them.
Checked on production after the ship: dated URLs 404, `?date=2026-05-01` → 200
with `latest.json`, and every `*_latest` feed plus `/api/cfb/games` → 200. Git
history remains the archive.

### Constraints on C and D

- The NHL and NFL feed contracts treat a feed more than **20 minutes** stale as
  unverified, and the heartbeat runs every 15. A heartbeat trim must keep every
  feed's `published_at` under 20 minutes old, or change the contract and the
  page banners together.
- The collector (line-archive) holds the Odds API key. Nothing about its
  cadence changes during rotation week.

## Blob migration, from 11/9 (no URL changes)

Pipelines upload feeds to Vercel Blob instead of committing them; this
project's routing forwards `/nhl/*`, `/nba/*`, `/nfl/*`, `/cfb/*`, `/mlb/*` to
the Blob store, so every member URL, Ghost paste and app bundle stays as is.
Feed commits can continue here as the archive, with an Ignored Build Step that
skips commits not touching `api/`. `api/mlb/games.js` and `api/cfb/games.js`
switch from `fs` reads to Blob fetches. Feeds can be up to ~60 s stale
(Blob's minimum cache). Scott declined the new-domain variant on 2026-10-26.

**On the agenda:** the NHL commit-volume product question, parked since
Oct 13, is half-answered by cost — NHL is 55% of all deploys. Decide the NHL
feed's cadence alongside the Blob move, which makes cadence free of deploy
cost.

## Next touch of `api/`

`api/dnt.js` is the retired D&T tombstone (410 for every request). It still
compiles on every build. Delete it the next time `api/` is edited for another
reason (Scott, 2026-10-27), and drop its section from `CLAUDE.md` if that file
is committed by then.
