// api/report/[token]/[sport]/[file].js
// Endpoint:  bettorday-api.vercel.app/api/report/<token>/cfb/<file>
//
// One bracketed folder per segment, not a [...path] catch-all: this project
// has no framework, and outside Next.js Vercel reads "[...path]" as ONE
// segment (its route is ^/api/report/([^/]+)$), so a catch-all never matched.
//
// Serves the private weekly CFB Matchup Report so its HTML OPENS in the browser.
// The report itself lives in Vercel Blob (published by CFB-Trench-Report's
// workflows, never committed here — this repo is public).  Blob serves HTML
// as a download, so this function fetches the file server-side and returns it
// with inline headers.
//
// Private by obscurity only, same as the Blob path: <token> is a random secret
// (REPORT_PATH_TOKEN), compared in constant time.  Every miss — wrong token,
// unknown file, missing settings, file not in Blob yet — is the same bare 404,
// so the endpoint confirms nothing.  Nothing here is secret: both settings are
// Vercel environment variables.
//
//   REPORT_PATH_TOKEN  the same random segment the publish step uploads under
//   REPORT_BLOB_BASE   the Blob store's base URL, e.g.
//                      https://<store-id>.public.blob.vercel-storage.com

import crypto from 'crypto';

const FILE = /^matchup_report_[A-Za-z0-9_]+\.(html|md|json)$/;
// Markdown as text/plain so browsers display it rather than download it; the
// chat app reads it the same either way.
const TYPES = {
  html: 'text/html; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  json: 'application/json; charset=utf-8',
};
// The page is static: inline styles and Google Fonts, no scripts, no forms.
// Served from this API's origin, so lock it down to exactly that.
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function notFound(res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).send('Not found');
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  const token = process.env.REPORT_PATH_TOKEN;
  const base = (process.env.REPORT_BLOB_BASE || '').replace(/\/+$/, '');
  if (!token || !/^https:\/\/[A-Za-z0-9.-]+$/.test(base)) return notFound(res);

  // Any '.' or '..' segment is refused outright, before anything resolves it.
  const raw = String(req.url).split('?')[0];
  if (/(^|\/)\.{1,2}(\/|$)/.test(raw)) return notFound(res);
  // Vercel hands the three segments over as query parameters; parse the path
  // only when it does not (a direct call, as in local tests).
  const q = req.query || {};
  let parts = [q.token, q.sport, q.file];
  if (parts.some((x) => x === undefined)) {
    const pathname = new URL(raw, 'http://local').pathname;
    parts = pathname.replace(/^\/api\/report\/?/, '').split('/');
    if (parts.length !== 3) return notFound(res);
  }
  if (parts.some((x) => typeof x !== 'string')) return notFound(res);
  const [given, sport, file] = parts;
  if (!sameSecret(given, token) || sport !== 'cfb' || !FILE.test(file)) return notFound(res);

  let upstream;
  try {
    upstream = await fetch(`${base}/${token}/cfb/${file}`, { cache: 'no-store' });
  } catch {
    return notFound(res);
  }
  if (!upstream.ok) return notFound(res);
  const body = Buffer.from(await upstream.arrayBuffer());

  const ext = file.slice(file.lastIndexOf('.') + 1);
  res.setHeader('Content-Type', TYPES[ext]);
  res.setHeader('Content-Disposition', 'inline');
  // Private: no shared (edge) cache; the browser may reuse it for a minute.
  res.setHeader('Cache-Control', 'private, max-age=60');
  if (ext === 'html') res.setHeader('Content-Security-Policy', CSP);
  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', String(body.length));
    return res.status(200).end();
  }
  return res.status(200).send(body);
}
