import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
import { getCnnFearGreed, getCryptoFearGreed } from '@/lib/sources/sentiment';
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
  const [cnn, crypto] = await Promise.all([getCnnFearGreed(), getCryptoFearGreed()]);
  if (cnn) await store.setSentiment('cnn_fg', cnn);
  if (crypto) await store.setSentiment('crypto_fg', crypto);
  return NextResponse.json({ ok: !!(cnn || crypto), cnn: cnn?.value ?? null, crypto: crypto?.value ?? null, store: store.storeMode() }, { status: cnn || crypto ? 200 : 502 });
}
export const GET = run;
export const POST = run;
