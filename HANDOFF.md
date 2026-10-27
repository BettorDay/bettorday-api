# HANDOFF — bettorday-api deploy cost

Operational record for what this project costs to deploy and the levers on it.
Keep it current as levers land. This repo is public, so dollar figures stay out
of it; they are on the Vercel Usage page.

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
| Retention policy (Settings → Security) | approved 10/26; Scott sets | _fill in: storage before/after_ |
| Build machine Standard, Elastic off; On-Demand Concurrent Builds off | approved 10/26; Scott sets | _fill in: build CPU-hours/day before/after_ |
| A: `.vercelignore` drops dated MLB archives | **live 10/27 00:05 UTC** (`373e00e`) | payload 157 MB / 383 files → 12.4 MB / 108 files (−92%). Build 0.42 min median → 0.35–0.37 min; still bills as 1 min, so the gain is storage, not build hours |
| C: heartbeat trim | after the Fri key swap | ~48 commits/day are timestamp-only heartbeats |
| D: collector batching | after the Fri key swap | one push per 10 min across feeds ≈ 437 → ~142/day (simulated) |
| MLB offseason shutdown | after the final World Series game | see `bettorday-mlb-pipeline/HANDOFF.md` |
| Blob migration (URLs unchanged) | next week's project | see below |

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

## Next week: Blob migration (no URL changes)

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
