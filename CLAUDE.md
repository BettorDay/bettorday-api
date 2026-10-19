# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`bettorday-api` is the backend for BettorDay (a sports-betting analytics site whose
frontend is a Ghost site at bettorday.com). It is deployed on **Vercel** as serverless
functions and a static asset host. There is **no build step, no `package.json`, no
test suite, no linter** — Vercel auto-detects the `api/` directory and serves each file
under it as a function, and serves everything in `public/` as a static asset.

To work on it locally you'd use `vercel dev` (Vercel CLI); there are no project-defined
commands. Deployment happens automatically when commits land on `main`.

## Architecture

Two distinct kinds of endpoints, distinguished by where their data comes from:

**1. Retired proxy — `api/dnt.js`**
Formerly proxied the Dunks & Threes (NBA) API. Retired 2026-10-14: it now returns
410 for every request and never contacts D&T or reads `DNT_API_KEY`. Nothing calls it
(the NBA Game Center was taken down in bettorday-app `d8156e8`). Do not restore a
browser-facing proxy; any future D&T use is a server-side pull in the NBA-HQ pipeline,
and only under a written agreement.

**2. Static-file readers — `api/mlb/games.js`, `api/cfb/games.js`**
These do **not** compute anything. They read pre-generated JSON out of `public/<sport>/`
(via `fs.readFileSync(path.join(process.cwd(), 'public', ...))`) and return it with CORS
+ cache headers. The actual analytics are produced by **external pipelines that live in
other repos** and commit their output JSON into `public/` here (see commit history:
"MLB Game Center: <date> pipeline run"). So this repo is the *delivery* layer; treat the
`public/*.json` files as generated artifacts, not source — don't hand-edit them.

- `api/mlb/games.js` — `?date=YYYY-MM-DD` selects `public/mlb/game_center_<date>.json`,
  falling back to `public/mlb/latest.json`. Date defaults to today in `America/New_York`.
  `latest.json` is a copy of the most recent dated file. MLB pipeline runs ~9:30 AM and
  3:30 PM ET daily.
- `api/cfb/games.js` — always serves `public/cfb/cfb_trench_latest.json` (a copy of the
  latest `cfb_trench_<season>_wk<NN>.json`). CFB pipeline runs Monday mornings.

## Data files in `public/`

- `public/mlb/game_center_<date>.json` — main MLB payload: `sharp_plays`, projections,
  `season_blend`, lineup readiness, etc. `latest.json` mirrors the newest one.
- `public/mlb/ballparkpal_<date>.json` — park/weather run & HR factors by stadium.
  Currently **not** read by any handler in `api/`; it's an input artifact for the
  pipeline, just stored here.
- `public/cfb/cfb_trench_<season>_wk<week>.json` + `cfb_trench_latest.json` — per-team
  CFB efficiency metrics (EPA, success rate, etc.).

## Conventions

- All handlers are ESM (`export default function handler(req, res)`) using Vercel's
  Node request/response signature, GET-only, with permissive CORS (`*`) for the readers.
- Cache via `Cache-Control: s-maxage=... , stale-while-revalidate=...` (Vercel edge
  cache) rather than any application-level cache.
- Secrets come only from `process.env`; never commit a real key.
