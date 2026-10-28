// api/odds/_shared.js — helpers for the odds proxy (not a route: Vercel skips
// files that start with "_").
//
// The six tool pages (odds, nfl, ncaaf, mlb, web-nfl-hq, web-cfb-hq) used to
// call the odds upstream from the browser with the key inlined.  They call
// these functions instead; the key lives only in process.env.ODDS_API_KEY on
// the server (rotation plan, HANDOFF.md, 2026-10-26).
//
// Books and markets are fixed here, never taken from the request, and any
// unknown query parameter is a 400: a caller can't widen what we pull or
// bust the edge cache to run down the quota.  Cost is then capped per
// endpoint by the cache window, however many members are viewing.

const BASE = 'https://api.the-odds-api.com/v4';

export const SPORTS = new Set([
  'americanfootball_nfl', 'americanfootball_ncaaf',
  'basketball_nba', 'basketball_wnba', 'basketball_ncaab',
  'icehockey_nhl', 'baseball_mlb',
]);

// `std` is the union of the odds page's 8 books and the hubs'/HQs' 8: exactly
// 10, so a call costs one region.  `mlb` is the MLB page's own 9 (Pinnacle,
// Bovada, LowVig); folding it into std would make 14 books and two regions.
// Pages filter the response down to their own list, so a page never averages
// a book it didn't show before.
export const BOOK_SETS = {
  std: ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers',
        'hardrockbet', 'prophetx', 'novig', 'espnbet', 'fanatics'],
  mlb: ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'betrivers',
        'pinnacle', 'prophetx', 'bovada', 'lowvig'],
};

const BANNED = ['the-odds-api', 'odds-api', 'apikey'];

export class NotConfigured extends Error {}
export class BadRequest extends Error {}
export class NotFound extends Error {}
class CreditFloor extends Error {}

// Credits left, from the last upstream response this instance saw.  Below the
// floor we stop calling and 503; the edge keeps serving what it has cached.
let remaining = null;
const FLOOR = Number(process.env.ODDS_CREDIT_FLOOR) || 100000;

// Allows exactly the named parameters, each at most once.
export function params(req, allowed) {
  const q = req.query || {};
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (!allowed.includes(k)) throw new BadRequest(`unknown parameter: ${k}`);
    if (Array.isArray(v)) throw new BadRequest(`repeated parameter: ${k}`);
    out[k] = String(v);
  }
  return out;
}

export function sport(p) {
  if (!SPORTS.has(p.sport)) throw new BadRequest('sport');
  return p.sport;
}

export function books(p) {
  const set = p.set || 'std';
  if (!BOOK_SETS[set]) throw new BadRequest('set');
  return BOOK_SETS[set];
}

export async function upstream(path, qs) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new NotConfigured();
  if (remaining !== null && remaining < FLOOR) throw new CreditFloor();
  const r = await fetch(BASE + path + '?' + new URLSearchParams({ ...qs, apiKey: key }));
  const left = Number(r.headers.get('x-requests-remaining'));
  if (Number.isFinite(left) && r.headers.get('x-requests-remaining') !== null) remaining = left;
  if (r.status === 404) throw new NotFound();
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

// The upstream's own shape, minus deep links (`link`, `sid`).  The book set
// is already applied upstream by the `bookmakers` parameter.
export function trim(x) {
  if (Array.isArray(x)) return x.map(trim);
  if (!x || typeof x !== 'object') return x;
  const o = {};
  for (const [k, v] of Object.entries(x)) {
    if (k === 'link' || k === 'links' || k === 'sid') continue;
    o[k] = trim(v);
  }
  return o;
}

export function cache(res, seconds) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=60`);
}

// Last check before anything leaves: no key, no vendor name.  `as_of` is when
// this response was pulled; with the edge cache it can trail "now" by up to
// the cache window, and the pages print it.
export function send(res, data) {
  const text = JSON.stringify({ as_of: new Date().toISOString(), data });
  const key = process.env.ODDS_API_KEY;
  const lower = text.toLowerCase();
  if (BANNED.some(w => lower.includes(w)) || (key && text.includes(key))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'guard' });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(text);
}

// Errors are never cached, so a bad minute upstream (or the regenerate gap
// on swap day) doesn't stick at the edge; pages keep the last lines they had.
export function fail(res, err) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (err instanceof BadRequest) return res.status(400).json({ error: 'bad_request', detail: err.message });
  if (err instanceof NotConfigured) return res.status(503).json({ error: 'not_configured' });
  if (err instanceof CreditFloor) return res.status(503).json({ error: 'credit_floor' });
  if (err instanceof NotFound) return res.status(404).json({ error: 'not_found' });
  return res.status(502).json({ error: 'upstream_unavailable' });
}

export function getOnly(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.status(204).end();
    return false;
  }
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(405).json({ error: 'method' });
    return false;
  }
  return true;
}
