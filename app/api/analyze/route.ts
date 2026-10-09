import { NextRequest, NextResponse } from 'next/server';
import { findInst } from '@/lib/instruments';
import { analyzeNews } from '@/lib/sources/groq';
import * as store from '@/lib/store';

export const maxDuration = 30;

// Shared limits for this PUBLIC endpoint, so nobody can burn the free Groq quota. Counted from the database.
const PER_MINUTE = 8;
const PER_DAY = 300;
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Runs the AI read for ONE headline, only when a visitor asks for it (clicks "Analyze with AI").
 * Each headline is analysed at most once: the result is saved and shown to everyone afterwards.
 */
export async function POST(req: NextRequest) {
  let id: unknown;
  try { id = (await req.json())?.id; } catch { /* fall through */ }
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad request' }, { status: 400, headers: NO_STORE });
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'AI analysis is not set up on this site.' }, { status: 503, headers: NO_STORE });

  try {
    const row = await store.getNewsById(id);
    if (!row) return NextResponse.json({ error: 'headline not found' }, { status: 404, headers: NO_STORE });
    if (row.ai_tone) { // already analysed by someone: serve the saved result, no Groq call
      return NextResponse.json({ cached: true, ai_tone: row.ai_tone, ai_impact: row.ai_impact, ai_summary: row.ai_summary, tickers: row.tickers ?? [] }, { headers: NO_STORE });
    }

    const now = Date.now();
    const [lastMin, lastDay] = await Promise.all([
      store.countAnalyzedSince(new Date(now - 60_000).toISOString()),
      store.countAnalyzedSince(new Date(now - 86_400_000).toISOString()),
    ]);
    if (lastMin >= PER_MINUTE) return NextResponse.json({ error: 'AI is busy right now. Try again in a minute.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } });
    if (lastDay >= PER_DAY) return NextResponse.json({ error: 'Today’s free AI limit has been reached. Try again tomorrow.' }, { status: 429, headers: NO_STORE });

    const { reads, error } = await analyzeNews([{ id: row.id, title: row.title, summary: row.summary }]);
    const r = reads.find((x) => x.id === row.id);
    if (!r) {
      // Upstream error text can contain account details (e.g. the Groq organisation id): log it, never send it to visitors.
      console.error('[analyze] Groq failed:', error ?? 'no result for this headline');
      return NextResponse.json({ error: error ? 'The AI service could not analyse this right now.' : 'The AI returned no result.' }, { status: 502, headers: NO_STORE });
    }

    const tickers = r.tickers.map((t) => t.toUpperCase()).filter((t) => /^[A-Z0-9.\-]{1,10}$/.test(t) || findInst(t));
    const ai = { ai_tone: r.tone, ai_impact: r.impact, ai_summary: r.summary, tickers };
    await store.setNewsAi(row.id, ai);
    return NextResponse.json({ cached: false, ...ai }, { headers: NO_STORE });
  } catch (e) {
    console.error('[analyze] failed:', (e as Error).message);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500, headers: NO_STORE });
  }
}
