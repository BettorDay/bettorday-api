# HANDOFF — bettorday-api deploy cost

Operational record for what this project costs to deploy and the levers on it.
Keep it current as levers land. This repo is public, so dollar figures stay out
of it; they are on the Vercel Usage page. The key-rotation record below lives
here too, because the proxy is this project's code; key values never go in it.

## Odds API key rotation — swap Fri 11/6, 8:00 AM EST (slid one week, Scott 2026-10-28)

The live Odds API key is inlined in six public tool pages. The fix is a
server-side proxy here (`api/odds/`, env `ODDS_API_KEY`), then the pages move
onto it, then the key is regenerated. The account is **regenerate-only**:
regenerating kills the old key instantly, so the swap and the revoke are one
sitting. The plan was approved 2026-10-26; this section is now its record.

**Schedule:**

| Day | What | Who |
|---|---|---|
| **Mon 11/2** | Monday runbook below: env var, then proxy push + verify, page flips (PWA live), MLB scrub, then cut + upload the rotation OTA | env + upload: Scott. Everything else: Claude |
| **Tue 11/3** | Ghost re-pastes alongside the normal Tuesday work: odds (with the NBA deep link), nfl, ncaaf, mlb, web-nfl-hq, web-cfb-hq, web-nba-hq. CFB HQ and NBA HQ were re-pasted for 1.1.43 on 10/28; they change again, so re-paste both. Check each in view-source: `the-odds-api` count is 0 | Scott |
| **Tue–Thu** | Soak. Check Capgo adoption of the rotation OTA and Odds API usage daily | both |
| **Thu 11/5** | Staging (below). In the evening, read Capgo adoption: go if ≥ ~90%, else the whole swap moves | both |
| **Fri 11/6** | **Swap 8:00–8:45 AM EST, go/no-go 7:55** (Scott, 2026-10-28). Same ordered checklist | Scott, then Claude verifies |

**Why 8:00 EST, not 9:00 (decided 2026-10-28).** DST ends Sun 11/1 and GitHub
crons run on UTC, so every key-using run fires an hour earlier on the ET clock.
8:00–8:45 EST is 13:00–13:45 UTC, the same quiet slot as the original
9:00–9:45 EDT. Friday 11/6 in EST:
- 5:47 / 7:47 / 9:47: NBA 1Q + NHL 1P main and backups. The backups do nothing
  if the main run published.
- **9:00: hard stop.** The NBA props shadow fires at 9:00 and 9:30 (GitHub
  `0,30 14-23`). It also publishes the member-facing `nba_periods_latest.json`.
- 9:00 onward, every 30 min: MLB, only if the World Series is still on.
- 9:47: NHL props.
- 3:17 PM: NFL props.

The alternative, 9:35–9:55, was rejected because the NHL props run and both
+4h backups fire at 9:47, inside it. The cron-job.org NBA ladder job is set to
America/New_York, so it stays at 10:00 AM ET. Scott checks its next-execution
times after Sunday.

**World Series watch.** The day after the final game, the MLB schedule is
commented out (`bettorday-mlb-pipeline/HANDOFF.md`). That takes MLB out of
Friday's picture, and its secret then goes unproven until spring. Update the
secret anyway. Coordinate the shutdown when the Series ends.

**Monday 11/2 runbook (the code is built and tested, 2026-10-28; local only):**

| Branch | Repo (worktree) | What |
|---|---|---|
| `odds-proxy` | bettorday-api (`repos/bettorday-api-oddsproxy`) | `api/odds/{board,scores,event}.js` + `_shared.js`; deletes the `api/dnt.js` tombstone |
| `odds-proxy-pages` | bettorday-app (`repos/bettorday-app-oddsproxy`) | the six pages flipped; the odds `?sport=` deep link, NBA HQ Line shop link (both twins), `forwardSearch` on `/odds` |
| `scrub-odds-fallback` | bettorday-mlb-pipeline (`repos/bettorday-mlb-pipeline-scrub`) | no hardcoded key fallback; CLOUD_SETUP stops printing the key |

1. **Scott:** set `ODDS_API_KEY` in this project to the **current** key, in
   every scope you want (Production at least). Note the scopes for Friday. No
   redeploy is needed: step 2's push deploys with it. Tell Claude when it's saved.
2. **Claude:** rebase `odds-proxy` on main and push. When the deploy is Ready, curl
   the three endpoints once each: 200, `{as_of,data}`, CORS `*`, no key or vendor
   name in the body, and `x-vercel-cache: HIT` on a repeat. Also check that an
   unknown parameter gets a 400. This costs about 3 + 2 + ~20 credits.
3. **Claude:** rebase `odds-proxy-pages` and push app main, which puts the PWA
   live. Load the PWA's odds, nfl, ncaaf and mlb pages and check for lines and the
   "Lines as of" stamp. The proxy has to be live first: pushing the pages before
   step 2 blanks odds on the PWA.
4. **Claude:** push `scrub-odds-fallback` over SSH. The secret already exists, so
   the next MLB run still works.
5. **Claude:** claim the next OTA number in `bettorday-app/WORKLIST.md`
   (**1.1.44** unless someone takes it first), copy `.env` in, build and check
   `dist/`: no key, no `the-odds-api`, no "Ghost API not configured". Then commit
   the cut.
6. **Scott:** upload it (`npx @capgo/cli bundle upload -c production`) and
   confirm the version in Capgo. The adoption clock starts here.

How the pages were checked (2026-10-28): headless Chrome, with each page's old
version run against an upstream mock and its new version against the real proxy
handlers, on one fixture with ProphetX and Novig priced off-market. The visible
text is identical on the initial load and on every click-through path. That
proves each page's `onlyBooks` filter keeps its consensus to its own books.

**Friday checklist, in order** (new key on the clipboard, never in chat):

| # | Step | Done when |
|---|---|---|
| 0 | 7:55 go/no-go: today's NBA 1Q and NHL 1P runs are finished green in Actions | both green |
| 1 | Regenerate in the Odds API dashboard. The old key dies now. Until step 2 the edge serves cached lines, then the proxy returns a `no-store` 502 | new key copied |
| 2 | This project: edit `ODDS_API_KEY` in every scope it's in, then Deployments → latest Production → **Redeploy** | Ready |
| 3 | Apps Script: Script Property `ODDS_API_KEY` → Save (no redeploy, after Thursday staging) | saved |
| 4 | GitHub secret `ODDS_API_KEY`: bettorday-mlb-pipeline, NFL-Trench-Report, NBA-HQ, NHL-HQ | all four "Updated now" |
| 5 | `printf %s "$NEW" \| shasum -a 256 \| cut -c1-16` → send Claude only the fingerprint | sent |

Then: Claude curls each proxy endpoint (200, fresh `as_of`, no key in the
body) and pushes the new `ODDS_EXPECT` to NBA-HQ `secrets_check`. Scott runs
`curl -s -o /dev/null -w "%{http_code}\n" "https://api.the-odds-api.com/v4/sports/?apiKey=$OLD"`
and expects 401, and 200 with `$NEW`. Each repo's next natural run proves its
secret: NBA props shadow 9:00, NHL props 9:47, MLB 9:00 (if still in season),
NFL props 3:17 PM. Struck: the chatbot (deleted).

**Thursday 11/5 staging (Scott):**
- **Apps Script (the key is a constant in `Code.gs`, Scott 2026-10-28):**
  1. Project Settings → Script Properties → add `ODDS_API_KEY` = the **old** key.
  2. Replace the constant's line with
     `const ODDS_API_KEY = PropertiesService.getScriptProperties().getProperty('ODDS_API_KEY');`.
     Keep the constant's existing name, so no call site changes.
  3. Save, then Deploy → Manage deployments → Edit → **New version** (same
     `/exec` URL).
  4. Confirm `Cache_Games` timestamps keep moving.

  After this, Friday's step 3 is a property edit. It can be done any day before
  Thursday; earlier is better.
- Confirm the Vercel scopes noted Monday.
- Open tabs: Odds API dashboard; this project's env vars and Deployments; Apps
  Script Script Properties; the four repos' `settings/secrets/actions`; NBA-HQ
  and NHL-HQ Actions.

**State as of 2026-10-28:**
- Key inventory, re-run on every repo's `origin/main`: unchanged from 10/26.
  With the three branches applied, `git grep` finds the key in no tracked file
  in bettorday-app or bettorday-mlb-pipeline.
- **1.1.43 was cut on 10/28** (NBA HQ Matchup blend + the CFB pure-live note,
  `5fd6a5d`). The CFB note no longer rides the rotation OTA. The rotation
  branches are rebased on top of it.
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
is committed by then. **Done on branch `odds-proxy`** (the proxy is that next
edit), so it lands Monday 11/2. `CLAUDE.md` is still untracked in the main
checkout, and its "Retired proxy" section should go when it is committed.
