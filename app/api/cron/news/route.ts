import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
import { findInst } from '@/lib/instruments';
import { analyzeNews } from '@/lib/sources/groq';
import { fetchAllNews } from '@/lib/sources/rss';
import * as store from '@/lib/store';

export const maxDuration = 60;

async function run(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return await job();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

async function job() {
  const items = await fetchAllNews();
  if (!items.length) return NextResponse.json({ ok: false, error: 'no RSS feed reachable' }, { status: 502 });

  // Only genuinely new URLs come back, so Groq sees each headline exactly once (CLAUDE.md #8).
  const fresh = await store.insertNews(items.slice(0, 120));
  // Newest headlines that have no AI read yet (covers rows inserted before a Groq key/model was fixed).
  const toAnalyze = (await store.getNews(60)).filter((n) => !n.ai_tone).slice(0, 12);
  let analyzed = 0;
  let groqError: string | undefined;
  for (let i = 0; i < toAnalyze.length; i += 6) {
    const batch = toAnalyze.slice(i, i + 6);
    const { reads, error, retryable } = await analyzeNews(batch.map((n) => ({ id: n.id, title: n.title, summary: n.summary })));
    if (error) { groqError = error; if (!retryable) break; continue; }
    for (const r of reads) {
      if (!batch.some((b) => b.id === r.id)) continue;
      const tickers = r.tickers.map((t) => t.toUpperCase()).filter((t) => /^[A-Z0-9.\-]{1,10}$/.test(t) || findInst(t));
      await store.setNewsAi(r.id, { ai_tone: r.tone, ai_impact: r.impact, ai_summary: r.summary, tickers });
      analyzed++;
    }
  }
  return NextResponse.json({ ok: true, fetched: items.length, inserted: fresh.length, analyzed, store: store.storeMode(), groq: !!process.env.GROQ_API_KEY, ...(groqError ? { groqError } : {}) });
}
export const GET = run;
export const POST = run;
