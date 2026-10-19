// api/nba/odds.js — NBA full-game lines by book, plus a consensus, for NBA HQ.
// Endpoint: https://bettorday-api.vercel.app/api/nba/odds
// Optional query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (ET dates; default today..today+6;
// at most 8 days)
//
// Reads the upstream server-side with process.env.BDL_API_KEY and returns a
// trimmed schema: the upstream's vendor becomes `book`, deep links are
// dropped, prediction markets are excluded, nulls stay null.  Edge-cached for
// 5 minutes; every book row carries the upstream's own update time as `as_of`.
//
// Consensus (the Gate A rule, NBA-HQ gate-a/SIGNOFF.md): the modal point
// across books, with the median prices of the books hanging that point and
// the book count.  A tie for the mode goes to the tied point nearest the
// median of every posted point (a further tie goes to the lower point), so
// the consensus is always a point some book actually hangs and has prices.
// Moneyline: the median of each side across books that post both.  Every
// median price is taken on implied probability and converted back.

import {
  EXCLUDED_BOOKS, upstreamAll, headers, send, fail, num, median, medianPrice, newest, todayET,
} from './_shared.js';

const MAX_DAYS = 8;

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

function status(g) {
  if (g.status === 'Final') return 'final';
  if (g.postponed) return 'postponed';
  return g.period && g.period > 0 ? 'in_progress' : 'scheduled';
}

function modal(points) {
  const xs = points.filter(x => x !== null);
  if (!xs.length) return null;
  const counts = new Map();
  for (const x of xs) counts.set(x, (counts.get(x) || 0) + 1);
  const top = Math.max(...counts.values());
  const tied = [...counts.keys()].filter(k => counts.get(k) === top).sort((a, b) => a - b);
  if (tied.length === 1) return tied[0];
  const m = median(xs);
  return tied.reduce((best, x) => (Math.abs(x - m) < Math.abs(best - m) ? x : best), tied[0]);
}

function consensus(books) {
  const sp = modal(books.map(b => b.spread_home));
  const spB = books.filter(b => sp !== null && b.spread_home === sp);
  const tot = modal(books.map(b => b.total));
  const totB = books.filter(b => tot !== null && b.total === tot);
  const mlB = books.filter(b => b.ml_home !== null && b.ml_away !== null);
  return {
    spread_home: sp,
    spread_home_price: medianPrice(spB.map(b => b.spread_home_price)),
    spread_away_price: medianPrice(spB.map(b => b.spread_away_price)),
    spread_books: spB.length,
    total: tot,
    over_price: medianPrice(totB.map(b => b.over_price)),
    under_price: medianPrice(totB.map(b => b.under_price)),
    total_books: totB.length,
    ml_home: medianPrice(mlB.map(b => b.ml_home)),
    ml_away: medianPrice(mlB.map(b => b.ml_away)),
    ml_books: mlB.length,
    as_of: newest([...spB, ...totB, ...mlB].map(b => b.as_of)),
  };
}

function bookRow(o) {
  return {
    book: o.vendor,
    spread_home: num(o.spread_home_value),
    spread_home_price: num(o.spread_home_odds),
    spread_away_price: num(o.spread_away_odds),
    total: num(o.total_value),
    over_price: num(o.total_over_odds),
    under_price: num(o.total_under_odds),
    ml_home: num(o.moneyline_home_odds),
    ml_away: num(o.moneyline_away_odds),
    as_of: o.updated_at || null,
  };
}

export default async function handler(req, res) {
  headers(res);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = re.test(req.query.from || '') ? req.query.from : todayET();
  const to = re.test(req.query.to || '') ? req.query.to : addDays(from, 6);
  const dates = dateRange(from, to);
  if (!dates.length) return res.status(400).json({ error: 'bad_range' });
  const dateParams = dates.map(d => ['dates[]', d]);

  try {
    const [games, odds] = await Promise.all([
      upstreamAll('/v1/games', dateParams),
      upstreamAll('/v2/odds', dateParams),
    ]);

    // One row per book per game: keep the newest if the upstream repeats one.
    const byGame = new Map();
    for (const o of odds) {
      if (!o.vendor || EXCLUDED_BOOKS.has(o.vendor)) continue;
      const m = byGame.get(o.game_id) || new Map();
      const prev = m.get(o.vendor);
      if (!prev || (o.updated_at || '') > (prev.updated_at || '')) m.set(o.vendor, o);
      byGame.set(o.game_id, m);
    }

    const out = games
      .map(g => {
        const books = [...(byGame.get(g.id) || new Map()).values()]
          .map(bookRow)
          .sort((a, b) => a.book.localeCompare(b.book));
        return {
          game_id: g.id,
          date_et: g.date,
          tip_utc: g.datetime || null,
          status: status(g),
          home: g.home_team.abbreviation,
          away: g.visitor_team.abbreviation,
          books,
          consensus: consensus(books),
        };
      })
      .sort((a, b) => (a.tip_utc || '').localeCompare(b.tip_utc || '') || a.game_id - b.game_id);

    return send(res, {
      feed: 'nba_odds_live',
      version: 1,
      generated_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      cache_seconds: 300,
      games: out,
    });
  } catch (err) {
    return fail(res, err);
  }
}
