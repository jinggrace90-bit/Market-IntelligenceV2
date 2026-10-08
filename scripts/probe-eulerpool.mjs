// CLAUDE.md: "if unsure about a third-party response format, request it once and look — do not guess."
// This script calls a few Eulerpool endpoints with YOUR key and prints what really comes back,
// so we can write lib/sources/eulerpool.ts against real field names.
//   1) put EULERPOOL_API_KEY=... in .env.local   2) npm run probe:eulerpool
import { loadEnv } from './env.mjs';

const key = loadEnv().EULERPOOL_API_KEY;
if (!key) { console.error('EULERPOOL_API_KEY is missing in .env.local'); process.exit(1); }
const base = 'https://api.eulerpool.com/v1';

// /earnings/calendar is the only path Eulerpool documents publicly. The rest are CANDIDATES: a 404 just
// means "wrong guess"; check https://www.eulerpool.com/financial-data-api for the real paths.
const paths = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/earnings/calendar',
  '/economic-calendar',
  '/calendar/economic',
  '/treasury/yields',
  '/macro/treasury-yields',
];

for (const p of paths) {
  try {
    const res = await fetch(base + p, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    console.log(`\n${res.status} ${p}  (x-ratelimit-remaining: ${res.headers.get('x-ratelimit-remaining') ?? 'n/a'})\n${text.slice(0, 500)}`);
  } catch (e) {
    console.log(`\nERR ${p}: ${e.message}`);
  }
}
