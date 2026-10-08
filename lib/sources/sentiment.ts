import { BROWSER_UA, fetchJson } from './http';

export interface SentimentReading {
  value: number;
  label: string;
  source: string;
  as_of: string;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** CNN Fear & Greed — unofficial JSON, needs browser-like headers (ARCHITECTURE §2). */
export async function getCnnFearGreed(): Promise<SentimentReading | null> {
  const j = await fetchJson<any>('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
    headers: {
      'user-agent': BROWSER_UA,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      origin: 'https://edition.cnn.com',
      referer: 'https://edition.cnn.com/',
    },
  });
  const fg = j?.fear_and_greed;
  if (!fg || typeof fg.score !== 'number') return null;
  return {
    value: Math.round(fg.score),
    label: capitalize(String(fg.rating ?? '')),
    source: 'CNN Fear & Greed (unofficial)',
    as_of: new Date(fg.timestamp).toISOString(),
  };
}

/** alternative.me — this is the CRYPTO index. Never label it as stock-market sentiment. */
export async function getCryptoFearGreed(): Promise<SentimentReading | null> {
  const j = await fetchJson<any>('https://api.alternative.me/fng/?limit=1');
  const d = j?.data?.[0];
  if (!d) return null;
  const value = Number(d.value);
  const ts = Number(d.timestamp) * 1000;
  if (!Number.isFinite(value) || !Number.isFinite(ts)) return null;
  return { value, label: String(d.value_classification), source: 'alternative.me (Crypto)', as_of: new Date(ts).toISOString() };
}
