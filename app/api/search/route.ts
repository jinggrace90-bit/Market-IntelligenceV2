import { NextRequest, NextResponse } from 'next/server';
import { searchSymbols } from '@/lib/sources/yahoo';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 1 || q.length > 40) return NextResponse.json({ results: [] });
  const results = await searchSymbols(q);
  if (!results) return NextResponse.json({ results: [], error: 'search unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' } });
}
