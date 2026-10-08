import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
import { ALL_STATIC } from '@/lib/instruments';
import { getQuotes } from '@/lib/sources/yahoo';
import * as store from '@/lib/store';

export const maxDuration = 60;

async function run(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = await getQuotes(ALL_STATIC.map((x) => x.y));
  if (!q) return NextResponse.json({ ok: false, error: 'Yahoo unreachable' }, { status: 502 });
  const rows = ALL_STATIC.filter((x) => q[x.y]).map((x) => ({ ...q[x.y], symbol: x.id, yahoo_symbol: x.y }));
  await store.upsertQuotes(rows);
  return NextResponse.json({ ok: true, saved: rows.length, store: store.storeMode() });
}
export const GET = run;
export const POST = run;
