import { createHash } from 'node:crypto';
import type { EconEvent } from '../types';
import { fetchJson } from './http';

// Unofficial ForexFactory mirror. ARCHITECTURE §2 fallback #2 for the economic calendar.
// It has no "actual" values, only forecast / previous.
const URLS = [
  'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
];

const CC: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', AUD: 'AU', NZD: 'NZ', CAD: 'CA', CHF: 'CH', CNY: 'CN', All: 'ALL',
};
const IMPACT: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

export async function getEconCalendar(): Promise<EconEvent[] | null> {
  const results = await Promise.all(URLS.map((u) => fetchJson<any[]>(u)));
  if (!results[0]) return null; // this week is required, next week is a bonus
  const out: EconEvent[] = [];
  for (const row of results.flatMap((r) => r ?? [])) {
    const impact = IMPACT[row.impact];
    const d = new Date(row.date);
    if (!impact || Number.isNaN(d.getTime())) continue; // skips "Holiday"
    const country = CC[row.country] ?? String(row.country).slice(0, 3).toUpperCase();
    const id = createHash('sha1').update(`${row.date}|${country}|${row.title}`).digest('hex').slice(0, 20);
    out.push({
      id,
      ts: d.toISOString(),
      country,
      name: String(row.title),
      impact,
      actual: null,
      forecast: row.forecast || null,
      prior: row.previous || null,
      source: 'ForexFactory (unofficial mirror)',
    });
  }
  return out;
}
