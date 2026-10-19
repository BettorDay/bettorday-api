// api/nba/props.js — NBA player props for one game: each book's main line.
// Endpoint: https://bettorday-api.vercel.app/api/nba/props?game_id=N
//
// Reads the upstream server-side with process.env.BDL_API_KEY (amended
// 2026-10-19, see NBA-HQ HANDOFF.md).  Keeps the over/under markets for the
// core five props only; alternate-line ladders ("milestone") are dropped.  A
// book that hangs several over/under lines for one player and prop keeps ONE:
// the line whose over and under implied probabilities are closest to each
// other (a tie goes to the lower line).  The vendor becomes `book`, deep links
// are dropped, prediction markets are excluded.  Edge-cached for 5 minutes;
// each line carries the upstream's update time as `as_of`.

import {
  EXCLUDED_BOOKS, upstream, upstreamAll, headers, send, fail, num, newest, implied,
} from './_shared.js';

const MARKETS = ['points', 'rebounds', 'assists', 'threes', 'points_rebounds_assists'];

function gap(row) {
  const o = implied(row.over), u = implied(row.under);
  return o === null || u === null ? Infinity : Math.abs(o - u);
}

export default async function handler(req, res) {
  headers(res);
  const gameId = Number(req.query.game_id);
  if (!Number.isInteger(gameId) || gameId <= 0) return res.status(400).json({ error: 'bad_game_id' });

  try {
    const d = await upstream('/v2/odds/player_props', [['game_id', String(gameId)]]);

    // (player, market, book) -> main line
    const best = new Map();
    for (const r of d.data || []) {
      if (!r.market || r.market.type !== 'over_under') continue;
      if (!MARKETS.includes(r.prop_type) || !r.vendor || EXCLUDED_BOOKS.has(r.vendor)) continue;
      const row = {
        book: r.vendor,
        line: num(r.line_value),
        over: num(r.market.over_odds),
        under: num(r.market.under_odds),
        as_of: r.updated_at || null,
      };
      if (row.line === null) continue;
      const k = `${r.player_id}|${r.prop_type}|${r.vendor}`;
      const prev = best.get(k);
      if (!prev || gap(row) < gap(prev.row) || (gap(row) === gap(prev.row) && row.line < prev.row.line)) {
        best.set(k, { player_id: r.player_id, market: r.prop_type, row });
      }
    }

    const ids = [...new Set([...best.values()].map(v => v.player_id))];
    const people = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50).map(id => ['player_ids[]', String(id)]);
      for (const p of await upstreamAll('/v1/players', chunk)) people.set(p.id, p);
    }

    const players = new Map();
    for (const { player_id, market, row } of best.values()) {
      const p = people.get(player_id);
      if (!players.has(player_id)) {
        players.set(player_id, {
          player_id,
          name: p ? `${p.first_name} ${p.last_name}`.trim() : null,
          team: p && p.team ? p.team.abbreviation : null,
          markets: {},
        });
      }
      (players.get(player_id).markets[market] ||= []).push(row);
    }
    for (const pl of players.values()) {
      for (const m of Object.keys(pl.markets)) pl.markets[m].sort((a, b) => a.book.localeCompare(b.book));
    }

    const list = [...players.values()].sort((a, b) =>
      (a.team || '').localeCompare(b.team || '') || (a.name || '').localeCompare(b.name || ''));
    return send(res, {
      feed: 'nba_props_live',
      version: 1,
      game_id: gameId,
      generated_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      cache_seconds: 300,
      as_of: newest([...best.values()].map(v => v.row.as_of)),
      players: list,
    });
  } catch (err) {
    return fail(res, err);
  }
}
