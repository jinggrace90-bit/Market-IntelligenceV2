import { after, NextRequest, NextResponse } from 'next/server';
import { toYahoo } from '@/lib/instruments';
import { cacheSeconds, chartParams, isRange } from '@/lib/ranges';
import { getChart } from '@/lib/sources/yahoo';
import * as store from '@/lib/store';
import type { ChartResponse } from '@/lib/types';

const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,15}$/;

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol') ?? '';
  const range = req.nextUrl.searchParams.get('range');
  if (!SYMBOL_RE.test(symbol) || !isRange(range)) return NextResponse.json({ error: 'bad params' }, { status: 400 });

  const y = toYahoo(symbol);
  const { period1, interval } = chartParams(range);
  const data = await getChart(y, range);

  if (data) {
    const last = data.points[data.points.length - 1][0];
    after(() => store.saveCandles(y, interval, data.points.map(([ts, c]) => ({ ts, c }))).catch(() => {}));
    const body: ChartResponse = {
      symbol, range, points: data.points, prevClose: data.prevClose, tz: data.tz,
      source: 'Yahoo Finance', asOf: new Date(last).toISOString(), stale: false,
    };
    const s = cacheSeconds(range);
    return NextResponse.json(body, { headers: { 'Cache-Control': `public, s-maxage=${s}, stale-while-revalidate=${s * 2}` } });
  }

  let saved = await store.loadCandles(y, interval, period1.getTime()).catch(() => []);
  // Daily-range fallback written by /api/cron/daily (kept under its own interval tag so it never mixes with Yahoo candles).
  if (!saved.length && interval === '1d') saved = await store.loadCandles(y, 'eulerpool-1d', period1.getTime()).catch(() => []);
  if (saved.length) {
    const body: ChartResponse = {
      symbol, range, points: saved.map((r) => [r.ts, r.c]), prevClose: null, tz: null,
      source: `${saved[saved.length - 1].source ?? 'Yahoo Finance'} (saved copy)`, asOf: new Date(saved[saved.length - 1].ts).toISOString(), stale: true,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=10' } });
  }
  return NextResponse.json({ error: 'chart unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
}
