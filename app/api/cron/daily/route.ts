import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
import { getEarnings, getUs10yHistory, getVixHistory } from '@/lib/sources/eulerpool';
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
  if (!process.env.EULERPOOL_API_KEY) return NextResponse.json({ ok: false, error: 'EULERPOOL_API_KEY not set' }, { status: 503 });
  const [earnings, us10y, vix] = await Promise.all([getEarnings(14), getUs10yHistory(400), getVixHistory()]);
  if (earnings) await store.upsertEarnings(earnings);
  // End-of-day history kept as a chart fallback if Yahoo is down (ARCHITECTURE §2).
  if (us10y) await store.saveCandles('^TNX', 'eulerpool-1d', us10y, 'Eulerpool');
  if (vix) await store.saveCandles('^VIX', 'eulerpool-1d', vix, 'Eulerpool');
  const ok = !!(earnings || us10y || vix);
  return NextResponse.json({ ok, earnings: earnings?.length ?? null, us10yDays: us10y?.length ?? null, vixDays: vix?.length ?? null, store: store.storeMode() }, { status: ok ? 200 : 502 });
}
export const GET = run;
export const POST = run;
