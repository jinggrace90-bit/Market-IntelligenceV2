import { CORE_SYMBOLS } from '../instruments';
import { withTimeout } from './http';

export interface AiRead {
  id: number;
  tone: 'Bullish' | 'Bearish' | 'Neutral';
  impact: 'macro' | 'sector' | 'company';
  tickers: string[];
  summary: string;
}

const MODEL = () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * One request for a batch of NEW headlines (CLAUDE.md #8: each item is analysed once, result stored).
 * Returns null on any failure so the caller simply leaves the AI fields empty.
 */
export async function analyzeNews(items: { id: number; title: string; summary: string | null }[]): Promise<AiRead[] | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key || !items.length) return null;
  const system =
    'You are a markets analyst. For each headline return JSON: {"items":[{"id":number,"tone":"Bullish|Bearish|Neutral","impact":"macro|sector|company","tickers":[],"summary":"..."}]}. ' +
    'tone = likely direction for broad US risk assets (Neutral if unclear). impact = macro (rates, inflation, central banks, jobs, oil, geopolitics), sector, or company. ' +
    `tickers: only from this list if clearly relevant: ${CORE_SYMBOLS.join(', ')}; you may also add US stock tickers explicitly named. ` +
    'summary: max 35 words, plain English, explain why it matters, hedge uncertainty, never give buy/sell advice.';
  const user = JSON.stringify(items.map((i) => ({ id: i.id, title: i.title, summary: i.summary?.slice(0, 240) ?? '' })));
  const res = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(),
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    }),
    20000,
  );
  if (!res || !res.ok) return null;
  try {
    const j = await res.json();
    const parsed = JSON.parse(j.choices[0].message.content);
    const out: AiRead[] = [];
    for (const r of parsed.items ?? []) {
      if (typeof r.id !== 'number') continue;
      out.push({
        id: r.id,
        tone: ['Bullish', 'Bearish', 'Neutral'].includes(r.tone) ? r.tone : 'Neutral',
        impact: ['macro', 'sector', 'company'].includes(r.impact) ? r.impact : 'company',
        tickers: Array.isArray(r.tickers) ? r.tickers.filter((t: unknown) => typeof t === 'string').slice(0, 5) : [],
        summary: String(r.summary ?? '').slice(0, 400),
      });
    }
    return out;
  } catch {
    return null;
  }
}
