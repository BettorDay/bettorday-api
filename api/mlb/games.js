// api/mlb/games.js
// Add this to your existing bettorday-api Vercel repo
// Endpoint: https://bettorday-api.vercel.app/api/mlb/games
// Optional query: ?date=2026-04-10

import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  // CORS — allow your Ghost site to fetch this
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const date = req.query.date || getTodayET();

  // Try date-specific file first, fall back to latest.json
  const dataDir  = path.join(process.cwd(), 'public', 'mlb');
  const datePath = path.join(dataDir, `game_center_${date}.json`);
  const latestPath = path.join(dataDir, 'latest.json');

  const filePath = fs.existsSync(datePath)   ? datePath
                 : fs.existsSync(latestPath) ? latestPath
                 : null;

  if (!filePath) {
    return res.status(404).json({
      error: 'No game center data found for this date.',
      date,
      tip: 'Pipeline runs at 9:30 AM and 3:30 PM ET daily.',
    });
  }

  try {
    const raw  = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse game center data.' });
  }
}

// Returns today's date in ET (handles EST/EDT automatically)
function getTodayET() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
}
