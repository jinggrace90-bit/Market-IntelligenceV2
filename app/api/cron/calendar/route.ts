import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
import { getEconCalendar } from '@/lib/sources/forexfactory';
import * as store from '@/lib/store';

export const maxDuration = 60;

async function run(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const events = await getEconCalendar();
  if (!events) return NextResponse.json({ ok: false, error: 'calendar source unreachable' }, { status: 502 });
  await store.upsertEvents(events);
  return NextResponse.json({ ok: true, events: events.length, store: store.storeMode() });
}
export const GET = run;
export const POST = run;
