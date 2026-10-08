import { NextResponse } from 'next/server';
import * as store from '@/lib/store';

export const dynamic = 'force-dynamic';

// Public diagnostics for setup problems. Reports only whether each variable EXISTS (never its value)
// plus whether the database can be read, so a silent misconfiguration becomes visible.
export async function GET() {
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL ?? '(default openai/gpt-oss-20b)',
    EULERPOOL_API_KEY: !!process.env.EULERPOOL_API_KEY,
  };
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const [quotes, news, sentiment, earn] = await Promise.all([
      store.getQuotes(),
      store.getNews(1),
      store.getSentiment(),
      store.getEarnings(new Date().toISOString().slice(0, 10), '2999-01-01'),
    ]);
    return NextResponse.json(
      { ok: true, store: store.storeMode(), env, rows: { quotes: Object.keys(quotes).length, sentimentKinds: Object.keys(sentiment).length, upcomingEarnings: earn.length }, newestNews: news[0]?.published_at ?? null },
      { headers },
    );
  } catch (e) {
    return NextResponse.json({ ok: false, store: store.storeMode(), env, error: (e as Error).message.slice(0, 300) }, { status: 500, headers });
  }
}
