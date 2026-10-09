import { fetchJson } from './http';
import type { SentimentReading } from './sentiment';

// Verified against the live API on 2026-10-08 (OpenAPI spec: GET https://api.eulerpool.com/api/1/documentation/yaml).
// Base is /api/1 (NOT /v1). Bearer header works, so the key never goes into a URL.
// Free tier = end-of-day data only (ARCHITECTURE §2): use for history / fallback, never intraday.
const BASE = 'https://api.eulerpool.com';
const SOURCE = 'Eulerpool';

async function get<T>(path: string): Promise<T | null> {
  const key = process.env.EULERPOOL_API_KEY;
  if (!key) return null;
  return fetchJson<T>(BASE + path, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' } });
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export interface EarningsRow {
  symbol: string;
  report_date: string; // YYYY-MM-DD
  eps_est: number | null;
  rev_est: number | null;
  source: string;
}

/** GET /api/1/calendar/earnings/{date} -> [{symbol,name,isin,date,epsEstimate,revenueEstimate}]. */
export async function getEarnings(daysAhead = 14): Promise<EarningsRow[] | null> {
  if (!process.env.EULERPOOL_API_KEY) return null;
  const out = new Map<string, EarningsRow>();
  let anyOk = false;
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(Date.now() + i * 86400000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const rows = await get<any[]>(`/api/1/calendar/earnings/${d.toISOString().slice(0, 10)}`);
    if (!rows) continue;
    anyOk = true;
    for (const r of rows) {
      // The row's own `date` is authoritative: the endpoint can include neighbouring days.
      if (!r.symbol || !/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '')) continue;
      out.set(`${r.symbol}|${r.date}`, { symbol: String(r.symbol), report_date: r.date, eps_est: num(r.epsEstimate), rev_est: num(r.revenueEstimate), source: SOURCE });
    }
  }
  return anyOk ? [...out.values()] : null;
}

export interface DailyClose { ts: number; c: number }

/** GET /api/1/government/treasury/yields?limit=N -> [{date,m1..y30}] with yields as STRINGS ("5.2700"), in percent. */
export async function getUs10yHistory(days = 400): Promise<DailyClose[] | null> {
  const rows = await get<any[]>(`/api/1/government/treasury/yields?limit=${days}`);
  if (!rows) return null;
  const out = rows.map((r) => ({ ts: Date.parse(r.date + 'T00:00:00Z'), c: num(r.y10) })).filter((r): r is DailyClose => r.c != null && Number.isFinite(r.ts));
  return out.length ? out.sort((a, b) => a.ts - b.ts) : null;
}

/** GET /api/1/market/cboe/indices?symbol=VIX -> [{symbol,date,open,high,low,close}], newest first. */
export async function getVixHistory(): Promise<DailyClose[] | null> {
  const rows = await get<any[]>('/api/1/market/cboe/indices?symbol=VIX');
  if (!rows) return null;
  const out = rows.map((r) => ({ ts: Date.parse(r.date + 'T00:00:00Z'), c: num(r.close) })).filter((r): r is DailyClose => r.c != null && Number.isFinite(r.ts));
  return out.length ? out.sort((a, b) => a.ts - b.ts) : null;
}

/**
 * GET /api/1/alternative/fear-and-greed?days=1
 *   -> { latest: { value: 38.11, rating: "fear", timestamp: <ms> }, history: {...} }
 * Same index (and same sub-indicator names) as CNN's. Used only when CNN blocks our server.
 * NOTE (verified 2026-10-09): adding `&indicator=fear_and_greed_historical` returned a STALE cached reading
 * (a day old) while the plain `?days=1` matched CNN exactly, so do not add that filter.
 */
export async function getFearGreedLatest(): Promise<SentimentReading | null> {
  const j = await get<any>('/api/1/alternative/fear-and-greed?days=1');
  const l = j?.latest;
  const value = num(l?.value), ts = num(l?.timestamp);
  if (value == null || ts == null) return null;
  const rating = String(l.rating ?? '');
  return { value: Math.round(value), label: rating.charAt(0).toUpperCase() + rating.slice(1), source: 'Fear & Greed via Eulerpool (CNN data, unofficial)', as_of: new Date(ts).toISOString() };
}
