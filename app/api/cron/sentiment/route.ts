import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/auth';
import { getFearGreedLatest } from '@/lib/sources/eulerpool';
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
  let stock = cnn.reading;
  let via: 'cnn' | 'eulerpool' | null = stock ? 'cnn' : null;
  if (!stock) { // CNN often blocks datacenter IPs; fall back to the same index through Eulerpool
    stock = await getFearGreedLatest();
    if (stock) via = 'eulerpool';
  }
  if (stock) await store.setSentiment('cnn_fg', stock);
  if (crypto.reading) await store.setSentiment('crypto_fg', crypto.reading);
  const ok = !!(stock || crypto.reading);
  return NextResponse.json(
    {
      ok, stock: stock?.value ?? null, stockVia: via, crypto: crypto.reading?.value ?? null,
      ...(cnn.error ? { cnnError: cnn.error } : {}), ...(crypto.error ? { cryptoError: crypto.error } : {}),
      store: store.storeMode(),
    },
    { status: ok ? 200 : 502 },
  );
}
export const GET = run;
export const POST = run;
