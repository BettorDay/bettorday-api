// api/odds/event.js — one game's markets, by named group.
// Endpoint: https://bettorday-api.vercel.app/api/odds/event?sport=<key>&id=<event id>&group=<group>
//
// The market lists are the ones each page asked the upstream for before the
// proxy, moved here unchanged (2026-10-28):
//   seg:<h1|h2|q1|p1|p2|p3|f5>  odds page, one period's board lines per game
//   detail                      odds page, the game popup (lines, alts, periods, props)
//   hub                         nfl/ncaaf hubs, "All Books" + "Player Props"
//   hqprops                     web-nfl-hq/web-cfb-hq, per-game player props
// Returns {as_of, data}: the upstream event object (deep links dropped).
// Edge-cached 5 minutes.  Cost per miss: the number of markets the upstream
// returns for the game.

import { params, sport, upstream, trim, cache, send, fail, getOnly, BadRequest, BOOK_SETS } from './_shared.js';

const CORE = ['h2h', 'spreads', 'totals'];

const SEGMENTS = {
  h1: ['h2h_h1', 'spreads_h1', 'totals_h1'],
  h2: ['h2h_h2', 'spreads_h2', 'totals_h2'],
  q1: ['h2h_q1', 'spreads_q1', 'totals_q1'],
  p1: ['h2h_p1', 'spreads_p1', 'totals_p1'],
  p2: ['h2h_p2', 'spreads_p2', 'totals_p2'],
  p3: ['h2h_p3', 'spreads_p3', 'totals_p3'],
  f5: ['h2h_1st_5_innings', 'spreads_1st_5_innings', 'totals_1st_5_innings'],
};

// The odds page's segment picker, per sport.
function segmentsFor(s) {
  if (s === 'baseball_mlb') return ['f5'];
  if (s === 'icehockey_nhl') return ['p1', 'p2', 'p3'];
  return ['h1', 'h2', 'q1'];
}

const HALVES_QUARTERS = ['h2h_h1', 'spreads_h1', 'totals_h1', 'h2h_h2', 'spreads_h2', 'totals_h2',
  'h2h_q1', 'spreads_q1', 'totals_q1', 'h2h_q2', 'h2h_q3', 'h2h_q4'];

function periodsFor(s) {
  if (s.includes('football') || s.includes('basketball')) return HALVES_QUARTERS;
  if (s.includes('hockey')) return ['h2h_p1', 'spreads_p1', 'totals_p1', 'h2h_p2', 'h2h_p3'];
  if (s.includes('baseball')) return SEGMENTS.f5;
  return [];
}

// The odds page's PLAYER_PROPS, flattened.  The nfl/ncaaf hubs ask for the
// same lists for their sport.
const PLAYER_PROPS = {
  americanfootball_nfl: ['player_anytime_td', 'player_1st_td', 'player_pass_yds', 'player_pass_tds',
    'player_pass_completions', 'player_pass_attempts', 'player_pass_interceptions', 'player_rush_yds',
    'player_rush_tds', 'player_rush_attempts', 'player_receptions', 'player_reception_yds',
    'player_reception_tds', 'player_field_goals', 'player_kicking_points'],
  americanfootball_ncaaf: ['player_anytime_td', 'player_1st_td', 'player_pass_yds', 'player_pass_tds',
    'player_pass_completions', 'player_rush_yds', 'player_rush_tds', 'player_receptions',
    'player_reception_yds'],
  basketball_nba: ['player_points', 'player_points_q1', 'player_rebounds', 'player_rebounds_q1',
    'player_assists', 'player_assists_q1', 'player_points_rebounds_assists', 'player_points_rebounds',
    'player_points_assists', 'player_rebounds_assists', 'player_threes', 'player_blocks', 'player_steals',
    'player_turnovers', 'player_double_double'],
  basketball_wnba: ['player_points', 'player_rebounds', 'player_assists', 'player_points_rebounds_assists',
    'player_threes'],
  basketball_ncaab: ['player_points', 'player_rebounds', 'player_assists', 'player_points_rebounds_assists'],
  icehockey_nhl: ['player_goals', 'player_goal_scorer_anytime', 'player_goal_scorer_first',
    'player_goal_scorer_last', 'player_points', 'player_assists', 'player_power_play_points',
    'player_shots_on_goal', 'player_blocked_shots', 'player_total_saves'],
  baseball_mlb: ['batter_hits', 'batter_total_bases', 'batter_home_runs', 'batter_rbis', 'batter_runs_scored',
    'batter_singles', 'batter_doubles', 'batter_walks', 'batter_strikeouts', 'batter_stolen_bases',
    'pitcher_strikeouts', 'pitcher_hits_allowed', 'pitcher_walks', 'pitcher_earned_runs', 'pitcher_outs'],
};

// web-nfl-hq / web-cfb-hq PROP_GROUPS, flattened.
const HQ_PROPS = ['player_pass_yds', 'player_pass_tds', 'player_pass_completions', 'player_pass_attempts',
  'player_pass_interceptions', 'player_pass_longest_completion', 'player_rush_yds', 'player_rush_attempts',
  'player_rush_longest', 'player_rush_tds', 'player_reception_yds', 'player_receptions',
  'player_reception_tds', 'player_reception_longest', 'player_anytime_td', 'player_1st_td', 'player_last_td',
  'player_kicking_points', 'player_field_goals', 'player_tackles_assists', 'player_sacks'];

const FOOTBALL = new Set(['americanfootball_nfl', 'americanfootball_ncaaf']);

export function marketsFor(s, group) {
  if (group.startsWith('seg:')) {
    const seg = group.slice(4);
    if (!segmentsFor(s).includes(seg)) throw new BadRequest('group');
    return SEGMENTS[seg];
  }
  if (group === 'detail') {
    return [...CORE, 'alternate_spreads', 'alternate_totals', 'team_totals', ...periodsFor(s), ...(PLAYER_PROPS[s] || [])];
  }
  if (group === 'hub' && FOOTBALL.has(s)) return [...CORE, ...PLAYER_PROPS[s]];
  if (group === 'hqprops' && FOOTBALL.has(s)) return HQ_PROPS;
  throw new BadRequest('group');
}

export default async function handler(req, res) {
  if (!getOnly(req, res)) return;
  try {
    const p = params(req, ['sport', 'id', 'group']);
    const s = sport(p);
    if (!/^[a-f0-9]{32}$/.test(p.id || '')) throw new BadRequest('id');
    const markets = marketsFor(s, p.group || '');
    const data = await upstream(`/sports/${s}/events/${p.id}/odds`, {
      markets: markets.join(','),
      oddsFormat: 'american',
      bookmakers: BOOK_SETS.std.join(','),
    });
    cache(res, 300);
    return send(res, trim(data));
  } catch (err) {
    return fail(res, err);
  }
}
