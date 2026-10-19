// api/nba/_shared.js — helpers for the NBA live-odds functions (not a route:
// Vercel skips files that start with "_").
//
// The upstream key lives only in process.env.BDL_API_KEY on the server.  It is
// never sent to the browser, and every response passes `guard` before it goes
// out (amended 2026-10-19, see NBA-HQ HANDOFF.md).

const BASE = 'https://api.balldontlie.io';

// Prediction markets are not sportsbooks; they stay out of the comparison
// (Scott, 2026-10-19).
export const EXCLUDED_BOOKS = new Set(['kalshi', 'polymarket']);

const BANNED = ['balldontlie', 'bdl', 'vendor', 'odds-api'];

export class NotConfigured extends Error {}

export async function upstream(path, params = []) {
  const key = process.env.BDL_API_KEY;
  if (!key) throw new NotConfigured();
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(BASE + path + (qs ? '?' + qs : ''), { headers: { Authorization: key } });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

// Follows next_cursor until the listing is exhausted.
export async function upstreamAll(path, params = []) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const p = [...params, ['per_page', '100']];
    if (cursor != null) p.push(['cursor', String(cursor)]);
    const d = await upstream(path, p);
    out.push(...(d.data || []));
    cursor = d.meta && d.meta.next_cursor;
    if (cursor == null) break;
  }
  return out;
}

export function headers(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
}

// Last check before anything leaves: no data-vendor names, no key.
export function send(res, body) {
  const text = JSON.stringify(body);
  const lower = text.toLowerCase();
  const key = process.env.BDL_API_KEY;
  if (BANNED.some(w => lower.includes(w)) || (key && text.includes(key))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'guard' });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(text);
}

export function fail(res, err) {
  res.setHeader('Cache-Control', 'no-store');
  if (err instanceof NotConfigured) return res.status(503).json({ error: 'not_configured' });
  return res.status(502).json({ error: 'upstream_unavailable' });
}

export function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function median(xs) {
  const s = xs.filter(x => x !== null).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function newest(isos) {
  const s = isos.filter(Boolean).sort();
  return s.length ? s[s.length - 1] : null;
}

// American odds -> implied probability.
export function implied(p) {
  if (p === null) return null;
  return p < 0 ? -p / (-p + 100) : 100 / (p + 100);
}

// Median of American prices, taken on implied probability (averaging -105 and
// +100 as plain numbers would give -2.5), converted back and rounded.
export function medianPrice(prices) {
  const p = median(prices.filter(x => x !== null).map(implied));
  if (p === null) return null;
  return Math.round(p >= 0.5 ? (-100 * p) / (1 - p) : (100 * (1 - p)) / p);
}

export function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
