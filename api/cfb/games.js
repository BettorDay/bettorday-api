// api/cfb/games.js
// Add this to the BettorDay/bettorday-api Vercel repo.
// Endpoint:  bettorday-api.vercel.app/api/cfb/games
// The weekly pipeline writes the JSON into public/cfb/.

import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  // Allow the Ghost site to fetch this cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

  const dir = path.join(process.cwd(), 'public', 'cfb');
  const latest = path.join(dir, 'cfb_trench_latest.json');

  if (!fs.existsSync(latest)) {
    return res.status(404).json({
      error: 'No CFB Trench Report data found.',
      tip: 'The pipeline runs every Monday morning.',
    });
  }
  try {
    const data = JSON.parse(fs.readFileSync(latest, 'utf8'));
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse CFB Trench Report data.' });
  }
}
