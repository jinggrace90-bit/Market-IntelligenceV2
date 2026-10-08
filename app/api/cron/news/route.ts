import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
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

// RSS only. AI analysis is NOT run here: it starts only when a visitor clicks "Analyze with AI" (/api/analyze).
async function job() {
  const items = await fetchAllNews();
  if (!items.length) return NextResponse.json({ ok: false, error: 'no RSS feed reachable' }, { status: 502 });
  const fresh = await store.insertNews(items.slice(0, 120));
  return NextResponse.json({ ok: true, fetched: items.length, inserted: fresh.length, store: store.storeMode() });
}
export const GET = run;
export const POST = run;
