// Fills the database by calling the cron routes once, exactly like the scheduler will.
//   npm run seed                       -> against http://localhost:3000
//   npm run seed -- https://your.site  -> against a deployed site (needs the same CRON_SECRET)
import { loadEnv } from './env.mjs';

const env = loadEnv();
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
if (!env.CRON_SECRET) { console.error('CRON_SECRET is missing (set it in .env.local)'); process.exit(1); }

for (const job of ['quotes', 'sentiment', 'calendar', 'news', 'daily']) {
  try {
    const res = await fetch(`${base}/api/cron/${job}`, { method: 'POST', headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    console.log(String(res.status).padEnd(4), job.padEnd(10), (await res.text()).slice(0, 200));
  } catch (e) {
    console.log('ERR ', job.padEnd(10), String(e.message));
  }
}
