import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EconEvent, NewsItem, Quote, SentimentRow } from './types';

/**
 * Persistence. Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
 * otherwise a local JSON file (.data/store.json) so `npm run dev` works on day one.
 * Server-side only: the service-role key must never reach the browser.
 */

export type QuoteRow = Quote & { symbol: string; yahoo_symbol: string };
export interface AiFields { ai_tone: string; ai_impact: string; ai_summary: string; tickers: string[] }
export interface CandleRow { ts: number; c: number; source?: string }
export interface EarningsRowDb { symbol: string; report_date: string; eps_est: number | null; rev_est: number | null; source: string }

let sb: SupabaseClient | null | undefined;
function supabase(): SupabaseClient | null {
  if (sb !== undefined) return sb;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let url = process.env.SUPABASE_URL?.trim();
  if (url) {
    // supabase-js appends /rest/v1 itself, so a pasted ".../rest/v1/" would double it (PGRST125). Keep only the origin.
    try { url = new URL(url).origin; } catch { url = undefined; }
  }
  sb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return sb;
}

/** Supabase calls return {error} instead of throwing. Never ignore it: a silent failure looks like "connected". */
function must<T extends { error: { message: string; code?: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}${res.error.code ? ` (${res.error.code})` : ''}`);
  return res;
}

export function storeMode(): 'supabase' | 'file' {
  return supabase() ? 'supabase' : 'file';
}

// ---------- file fallback ----------
interface FileDb {
  quotes: Record<string, QuoteRow & { fetched_at: string }>;
  news: NewsItem[];
  sentiment: Record<string, SentimentRow>;
  events: Record<string, EconEvent>;
  candles: Record<string, CandleRow[]>;
  earnings?: Record<string, EarningsRowDb>;
  seq: number;
}
const FILE = path.join(process.cwd(), '.data', 'store.json');
function readFile(): FileDb {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { quotes: {}, news: [], sentiment: {}, events: {}, candles: {}, seq: 0 };
  }
}
function writeFile(db: FileDb) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch {
    /* read-only filesystem (e.g. Vercel without Supabase): ignore */
  }
}

// ---------- quotes ----------
export async function upsertQuotes(rows: QuoteRow[]): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const db = supabase();
  if (db) {
    must(await db.from('quotes_latest').upsert(
      rows.map((r) => ({
        symbol: r.symbol, yahoo_symbol: r.yahoo_symbol, price: r.price, change: r.change, change_pct: r.changePct,
        prev_close: r.prevClose, day_low: r.dayLow, day_high: r.dayHigh, wk52_low: r.wk52Low, wk52_high: r.wk52High,
        market_state: r.marketState, source: r.source, as_of: r.asOf, fetched_at: now,
      })),
    ), 'quotes upsert');
    return;
  }
  const f = readFile();
  for (const r of rows) f.quotes[r.symbol] = { ...r, fetched_at: now };
  writeFile(f);
}

export async function getQuotes(): Promise<Record<string, Quote & { fetchedAt: string }>> {
  const db = supabase();
  if (db) {
    const { data } = must(await db.from('quotes_latest').select('*'), 'quotes read');
    const out: Record<string, Quote & { fetchedAt: string }> = {};
    for (const r of data ?? []) {
      out[r.symbol] = {
        price: Number(r.price), change: Number(r.change ?? 0), changePct: Number(r.change_pct ?? 0),
        prevClose: r.prev_close == null ? null : Number(r.prev_close),
        dayLow: r.day_low == null ? null : Number(r.day_low), dayHigh: r.day_high == null ? null : Number(r.day_high),
        wk52Low: r.wk52_low == null ? null : Number(r.wk52_low), wk52High: r.wk52_high == null ? null : Number(r.wk52_high),
        marketState: r.market_state, asOf: r.as_of, source: r.source, fetchedAt: r.fetched_at,
      };
    }
    return out;
  }
  const f = readFile();
  const out: Record<string, Quote & { fetchedAt: string }> = {};
  for (const [k, r] of Object.entries(f.quotes)) out[k] = { ...r, fetchedAt: r.fetched_at };
  return out;
}

// ---------- news ----------
type NewRow = Pick<NewsItem, 'url' | 'title' | 'summary' | 'source' | 'published_at'>;

/** Inserts only unseen URLs and returns just those new rows (so Groq runs once per item). */
export async function insertNews(items: NewRow[]): Promise<NewsItem[]> {
  if (!items.length) return [];
  const db = supabase();
  if (db) {
    const { data } = must(await db.from('news').upsert(items, { onConflict: 'url', ignoreDuplicates: true }).select(), 'news insert');
    return (data ?? []) as NewsItem[];
  }
  const f = readFile();
  const have = new Set(f.news.map((n) => n.url));
  const added: NewsItem[] = [];
  for (const it of items) {
    if (have.has(it.url)) continue;
    const row: NewsItem = { id: ++f.seq, ...it, tickers: null, ai_tone: null, ai_impact: null, ai_summary: null };
    f.news.push(row);
    added.push(row);
  }
  f.news.sort((a, b) => b.published_at.localeCompare(a.published_at));
  f.news = f.news.slice(0, 300);
  writeFile(f);
  return added;
}

export async function setNewsAi(id: number, ai: AiFields): Promise<void> {
  const db = supabase();
  if (db) {
    must(await db.from('news').update({ ...ai, analyzed_at: new Date().toISOString() }).eq('id', id), 'news AI update');
    return;
  }
  const f = readFile();
  const n = f.news.find((x) => x.id === id);
  if (n) Object.assign(n, ai);
  writeFile(f);
}

export async function getNews(limit = 40): Promise<NewsItem[]> {
  const db = supabase();
  if (db) {
    const { data } = must(await db
      .from('news')
      .select('id,url,title,summary,source,published_at,tickers,ai_tone,ai_impact,ai_summary')
      .order('published_at', { ascending: false })
      .limit(limit), 'news read');
    return (data ?? []) as NewsItem[];
  }
  return readFile().news.slice(0, limit);
}

// ---------- sentiment ----------
export async function setSentiment(kind: string, r: Omit<SentimentRow, 'kind' | 'fetched_at'>): Promise<void> {
  const row = { kind, ...r, fetched_at: new Date().toISOString() };
  const db = supabase();
  if (db) {
    must(await db.from('sentiment').upsert(row), 'sentiment upsert');
    return;
  }
  const f = readFile();
  f.sentiment[kind] = row;
  writeFile(f);
}

export async function getSentiment(): Promise<Record<string, SentimentRow>> {
  const db = supabase();
  if (db) {
    const { data } = must(await db.from('sentiment').select('*'), 'sentiment read');
    return Object.fromEntries((data ?? []).map((r: SentimentRow) => [r.kind, r]));
  }
  return readFile().sentiment;
}

// ---------- economic events ----------
export async function upsertEvents(rows: EconEvent[]): Promise<void> {
  if (!rows.length) return;
  const db = supabase();
  if (db) {
    must(await db.from('econ_events').upsert(rows), 'events upsert');
    return;
  }
  const f = readFile();
  for (const r of rows) f.events[r.id] = r;
  writeFile(f);
}

export async function getEvents(fromIso: string, toIso: string): Promise<EconEvent[]> {
  const db = supabase();
  if (db) {
    const { data } = must(await db.from('econ_events').select('*').gte('ts', fromIso).lt('ts', toIso).order('ts'), 'events read');
    return (data ?? []) as EconEvent[];
  }
  return Object.values(readFile().events)
    .filter((e) => e.ts >= fromIso && e.ts < toIso)
    .sort((a, b) => a.ts.localeCompare(b.ts));
}

// ---------- candles (fallback when Yahoo is down) ----------
export async function saveCandles(symbol: string, interval: string, rows: CandleRow[], source = 'Yahoo Finance'): Promise<void> {
  if (!rows.length) return;
  const db = supabase();
  if (db) {
    const payload = rows.map((r) => ({ symbol, interval, ts: new Date(r.ts).toISOString(), c: r.c, source }));
    for (let i = 0; i < payload.length; i += 500) must(await db.from('candles').upsert(payload.slice(i, i + 500)), 'candles upsert');
    return;
  }
  const f = readFile();
  f.candles[`${symbol}|${interval}`] = rows.map((r) => ({ ...r, source }));
  writeFile(f);
}

export async function loadCandles(symbol: string, interval: string, sinceMs: number): Promise<CandleRow[]> {
  const db = supabase();
  if (db) {
    const { data } = must(await db
      .from('candles').select('ts,c,source').eq('symbol', symbol).eq('interval', interval)
      .gte('ts', new Date(sinceMs).toISOString()).order('ts').limit(5000), 'candles read');
    return (data ?? []).map((r) => ({ ts: new Date(r.ts).getTime(), c: Number(r.c), source: r.source as string }));
  }
  return (readFile().candles[`${symbol}|${interval}`] ?? []).filter((r) => r.ts >= sinceMs);
}

// ---------- earnings calendar (Eulerpool, daily job) ----------
export async function upsertEarnings(rows: EarningsRowDb[]): Promise<void> {
  if (!rows.length) return;
  const db = supabase();
  if (db) {
    for (let i = 0; i < rows.length; i += 500) must(await db.from('earnings_events').upsert(rows.slice(i, i + 500)), 'earnings upsert');
    return;
  }
  const f = readFile();
  f.earnings = f.earnings ?? {};
  for (const r of rows) f.earnings[`${r.symbol}|${r.report_date}`] = r;
  writeFile(f);
}

export async function countEarnings(): Promise<number> {
  const db = supabase();
  if (db) return must(await db.from('earnings_events').select('*', { count: 'exact', head: true }), 'earnings count').count ?? 0;
  return Object.keys(readFile().earnings ?? {}).length;
}

export async function getEarnings(fromDate: string, toDate: string): Promise<EarningsRowDb[]> {
  const db = supabase();
  if (db) {
    const { data } = must(await db.from('earnings_events').select('*').gte('report_date', fromDate).lte('report_date', toDate).order('report_date').limit(3000), 'earnings read');
    return (data ?? []).map((r) => ({
      symbol: r.symbol, report_date: r.report_date, source: r.source,
      eps_est: r.eps_est == null ? null : Number(r.eps_est), rev_est: r.rev_est == null ? null : Number(r.rev_est),
    }));
  }
  return Object.values(readFile().earnings ?? {}).filter((r) => r.report_date >= fromDate && r.report_date <= toDate);
}
