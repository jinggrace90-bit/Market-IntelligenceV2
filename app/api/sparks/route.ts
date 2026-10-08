import { NextResponse } from 'next/server';
import { TAPE, toYahoo } from '@/lib/instruments';
import { getChart } from '@/lib/sources/yahoo';

// Tiny 1-day sparklines for the cross-asset tape. One request for all 8, cached 5 minutes.
export async function GET() {
  const entries = await Promise.all(
    TAPE.map(async (id) => {
      const d = await getChart(toYahoo(id), '1D');
      if (!d) return [id, null] as const;
      const step = Math.max(1, Math.floor(d.points.length / 40));
      return [id, d.points.filter((_, i) => i % step === 0 || i === d.points.length - 1).map((p) => p[1])] as const;
    }),
  );
  const sparks = Object.fromEntries(entries.filter(([, v]) => v));
  if (!Object.keys(sparks).length) return NextResponse.json({ sparks: {} }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ sparks }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } });
}
