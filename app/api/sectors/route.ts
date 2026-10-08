import { NextRequest, NextResponse } from 'next/server';
import { cacheSeconds, isRange, type RangeId } from '@/lib/ranges';
import { BASE, HELPERS } from '@/lib/instruments';
import { getQuotes, getSeries } from '@/lib/sources/yahoo';
import type { ChartPoint } from '@/lib/types';

const DAY = 86400000;

// Instruments whose range return we need: 11 sector ETFs + SPY/RSP/IWM + the 4 US indices.
const TARGETS = [...HELPERS, ...BASE.filter((b) => ['SPX', 'NDX', 'DJI', 'RUT'].includes(b.id))];

function window(range: RangeId, now: number): { period1: Date; interval: string } {
  const y = new Date(now).getUTCFullYear();
  switch (range) {
    case '5D': return { period1: new Date(now - 12 * DAY), interval: '1d' };
    case '1M': return { period1: new Date(now - 32 * DAY), interval: '1d' };
    case '6M': return { period1: new Date(now - 185 * DAY), interval: '1d' };
    case 'YTD': return { period1: new Date(Date.UTC(y, 0, 1) - 6 * DAY), interval: '1d' };
    case '1Y': return { period1: new Date(now - 367 * DAY), interval: '1d' };
    case '5Y': return { period1: new Date(now - 5 * 367 * DAY), interval: '1wk' };
    default: return { period1: new Date(0), interval: '1mo' };
  }
}

function rangeReturn(range: RangeId, points: ChartPoint[], now: number): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1][1];
  let base: number;
  if (range === '5D') {
    if (points.length < 6) return null;
    base = points[points.length - 6][1];
  } else if (range === 'YTD') {
    const jan1 = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
    const before = points.filter((p) => p[0] < jan1);
    base = (before.length ? before[before.length - 1] : points[0])[1];
  } else {
    base = points[0][1];
  }
  return base ? ((last - base) / base) * 100 : null;
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get('range');
  if (!isRange(range)) return NextResponse.json({ error: 'bad range' }, { status: 400 });
  const now = Date.now();
  const returns: Record<string, number> = {};

  if (range === '1D') {
    const q = await getQuotes(TARGETS.map((t) => t.y));
    if (!q) return NextResponse.json({ error: 'unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    for (const t of TARGETS) if (q[t.y]) returns[t.id] = q[t.y].changePct;
  } else {
    const { period1, interval } = window(range, now);
    await Promise.all(
      TARGETS.map(async (t) => {
        const s = await getSeries(t.y, period1, interval);
        const r = s ? rangeReturn(range, s.points, now) : null;
        if (r != null) returns[t.id] = r;
      }),
    );
    if (!Object.keys(returns).length) return NextResponse.json({ error: 'unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
  const s = range === '1D' ? 30 : cacheSeconds(range);
  return NextResponse.json(
    { range, returns, asOf: new Date(now).toISOString(), source: 'Yahoo Finance' },
    { headers: { 'Cache-Control': `public, s-maxage=${s}, stale-while-revalidate=${s * 2}` } },
  );
}
