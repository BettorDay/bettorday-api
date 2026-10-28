// api/odds/board.js — one sport's full-game board: moneyline, spread, total.
// Endpoint: https://bettorday-api.vercel.app/api/odds/board?sport=<key>[&set=std|mlb]
//
// Returns {as_of, data}, where data is the upstream's event array (deep links
// dropped).  Edge-cached 2 minutes, which matches the odds page's fastest
// refresh.  Cost: 3 credits per miss.

import { params, sport, books, upstream, trim, cache, send, fail, getOnly } from './_shared.js';

export default async function handler(req, res) {
  if (!getOnly(req, res)) return;
  try {
    const p = params(req, ['sport', 'set']);
    const s = sport(p);
    const data = await upstream(`/sports/${s}/odds/`, {
      markets: 'h2h,spreads,totals',
      oddsFormat: 'american',
      bookmakers: books(p).join(','),
    });
    cache(res, 120);
    return send(res, trim(data));
  } catch (err) {
    return fail(res, err);
  }
}
