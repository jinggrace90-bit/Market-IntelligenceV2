// CLAUDE.md: "if unsure about a third-party response format, request it once and look — do not guess."
// Calls Eulerpool with YOUR key and prints what really comes back. All paths below were verified on 2026-10-08.
//   1) EULERPOOL_API_KEY=... in .env.local    2) npm run probe:eulerpool
// Full list of ~375 endpoints (OpenAPI):  curl -H "Authorization: Bearer $KEY" https://api.eulerpool.com/api/1/documentation/yaml
import { loadEnv } from './env.mjs';

const key = loadEnv().EULERPOOL_API_KEY;
if (!key) { console.error('EULERPOOL_API_KEY is missing in .env.local'); process.exit(1); }
const base = 'https://api.eulerpool.com';
const today = new Date().toISOString().slice(0, 10);

const paths = process.argv.slice(2).length ? process.argv.slice(2) : [
  `/api/1/calendar/earnings/${today}`,
  '/api/1/government/treasury/yields?limit=3',
  '/api/1/market/cboe/indices?symbol=VIX',
  '/api/1/calendar/economic-calendar?days=3&limit=3',
];

for (const p of paths) {
  try {
    const res = await fetch(base + p, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    console.log(`\n${res.status} ${p}\n${text.slice(0, 400)}`);
  } catch (e) {
    console.log(`\nERR ${p}: ${e.message}`);
  }
}
