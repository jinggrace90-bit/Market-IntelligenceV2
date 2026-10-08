import YahooFinance from 'yahoo-finance2';
import type { Quote } from '../types';
import { chartParams, type RangeId } from '../ranges';
import { withTimeout } from './http';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const SOURCE = 'Yahoo Finance';

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Yahoo sometimes reports a day/52-week low of exactly 0 around session rollover. A real range bound is never <= 0 here. */
function bound(v: unknown): number | null {
  const n = num(v);
  return n != null && n > 0 ? n : null;
}

/** One batched request for any number of Yahoo symbols. Keyed by Yahoo symbol. */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote> | null> {
  if (!symbols.length) return {};
  const res = await withTimeout(yf.quote(symbols, {}, { validateResult: false }) as Promise<any[]>);
  if (!res) return null;
  const out: Record<string, Quote> = {};
  for (const q of res) {
    const price = num(q.regularMarketPrice);
    if (price == null || !q.symbol) continue;
    const change = num(q.regularMarketChange) ?? 0;
    const t = q.regularMarketTime instanceof Date ? q.regularMarketTime : new Date();
    out[q.symbol] = {
      price,
      change,
      changePct: num(q.regularMarketChangePercent) ?? 0,
      prevClose: num(q.regularMarketPreviousClose),
      dayLow: bound(q.regularMarketDayLow),
      dayHigh: bound(q.regularMarketDayHigh),
      wk52Low: bound(q.fiftyTwoWeekLow),
      wk52High: bound(q.fiftyTwoWeekHigh),
      marketState: typeof q.marketState === 'string' ? q.marketState : null,
      asOf: t.toISOString(),
      source: SOURCE,
    };
  }
  return out;
}

export interface ChartData {
  points: [number, number][];
  prevClose: number | null;
  tz: string | null;
}

function dayKey(ts: number, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz ?? 'UTC' }).format(ts);
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

/** Raw close series for an arbitrary window (no session trimming). */
export async function getSeries(symbol: string, period1: Date, interval: string): Promise<ChartData | null> {
  const res = (await withTimeout(yf.chart(symbol, { period1, interval: interval as any }, { validateResult: false }) as Promise<any>)) as any;
  if (!res || !Array.isArray(res.quotes)) return null;
  const points: [number, number][] = res.quotes
    .filter((q: any) => q.date && typeof q.close === 'number' && Number.isFinite(q.close))
    .map((q: any) => [new Date(q.date).getTime(), q.close as number]);
  if (!points.length) return null;
  return { points, prevClose: num(res.meta?.chartPreviousClose) ?? num(res.meta?.previousClose), tz: res.meta?.exchangeTimezoneName ?? null };
}

export async function getChart(symbol: string, range: RangeId): Promise<ChartData | null> {
  const { period1, interval } = chartParams(range);
  const raw = await getSeries(symbol, period1, interval);
  if (!raw) return null;
  const tz = raw.tz;
  let points = raw.points;

  if (range === '1D' || range === '5D') {
    const keep = range === '1D' ? 1 : 5;
    const keys: string[] = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const k = dayKey(points[i][0], tz);
      if (!keys.includes(k)) keys.push(k);
    }
    const allowed = new Set(keys.slice(0, keep));
    points = points.filter((p) => allowed.has(dayKey(p[0], tz)));
  }
  return { points, prevClose: raw.prevClose, tz };
}

export type { SearchHit } from './yahoo-types';
import type { SearchHit } from './yahoo-types';

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'CRYPTOCURRENCY', 'FUTURE', 'CURRENCY', 'MUTUALFUND']);

export async function searchSymbols(q: string): Promise<SearchHit[] | null> {
  const res = (await withTimeout(yf.search(q, { quotesCount: 10, newsCount: 0 }, { validateResult: false }) as Promise<any>)) as any;
  if (!res || !Array.isArray(res.quotes)) return null;
  return res.quotes
    .filter((x: any) => x.symbol && ALLOWED_TYPES.has(x.quoteType))
    .map((x: any) => ({
      symbol: String(x.symbol),
      name: String(x.shortname ?? x.longname ?? x.symbol),
      exch: String(x.exchDisp ?? x.exchange ?? ''),
      type: String(x.quoteType),
    }));
}
