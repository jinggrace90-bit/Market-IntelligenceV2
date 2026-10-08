import { after, NextRequest, NextResponse } from 'next/server';
import { toYahoo } from '@/lib/instruments';
import { getQuotes } from '@/lib/sources/yahoo';
import * as store from '@/lib/store';
import type { Quote, QuoteResponse } from '@/lib/types';

const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,15}$/;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const tokens = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 40);
  if (!tokens.length) return NextResponse.json({ error: 'symbols required' }, { status: 400 });

  const yahooOf = new Map(tokens.map((t) => [t, toYahoo(t)]));
  const fresh = await getQuotes([...new Set(yahooOf.values())]);

  if (fresh) {
    const quotes: Record<string, Quote> = {};
    const rows: store.QuoteRow[] = [];
    for (const t of tokens) {
      const q = fresh[yahooOf.get(t)!];
      if (!q) continue;
      quotes[t] = q;
      rows.push({ ...q, symbol: t, yahoo_symbol: yahooOf.get(t)! });
    }
    // Write-behind: never block the response on the database.
    after(() => store.upsertQuotes(rows).catch(() => {}));
    const body: QuoteResponse = { quotes, fetchedAt: new Date().toISOString(), stale: false };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=60' } });
  }

  // Yahoo failed: serve the last saved values and say so.
  const saved = await store.getQuotes().catch(() => ({}) as Awaited<ReturnType<typeof store.getQuotes>>);
  const quotes: Record<string, Quote> = {};
  let newest = 0;
  for (const t of tokens) {
    const s = saved[t];
    if (!s) continue;
    const { fetchedAt, ...q } = s;
    quotes[t] = q;
    newest = Math.max(newest, new Date(fetchedAt).getTime());
  }
  const body: QuoteResponse = { quotes, fetchedAt: new Date(newest || Date.now()).toISOString(), stale: true };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, s-maxage=5' } });
}
