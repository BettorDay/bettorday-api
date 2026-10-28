// api/odds/scores.js — live and recent scores for one sport (the odds page).
// Endpoint: https://bettorday-api.vercel.app/api/odds/scores?sport=<key>
//
// Returns {as_of, data}: the upstream's scores array for the last 3 days.
// Edge-cached 2 minutes.  Cost: 2 credits per miss.

import { params, sport, upstream, trim, cache, send, fail, getOnly } from './_shared.js';

export default async function handler(req, res) {
  if (!getOnly(req, res)) return;
  try {
    const s = sport(params(req, ['sport']));
    const data = await upstream(`/sports/${s}/scores/`, { daysFrom: '3' });
    cache(res, 120);
    return send(res, trim(data));
  } catch (err) {
    return fail(res, err);
  }
}
