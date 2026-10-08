import { CORE_SYMBOLS } from '../instruments';
import { withTimeout } from './http';

export interface AiRead {
  id: number;
  tone: 'Bullish' | 'Bearish' | 'Neutral';
  impact: 'macro' | 'sector' | 'company';
  tickers: string[];
  summary: string;
}

const MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export interface AnalyzeResult { reads: AiRead[]; error?: string; retryable?: boolean }

/**
 * One request for a batch of NEW headlines (CLAUDE.md #8: each item is analysed once, result stored).
 * Never throws: on failure `reads` is empty and `error` says why (so the news simply has no AI tag).
 */
export async function analyzeNews(items: { id: number; title: string; summary: string | null }[]): Promise<AnalyzeResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { reads: [], error: 'GROQ_API_KEY not set' };
  if (!items.length) return { reads: [] };
  const system =
    'You are a markets analyst. For each headline return JSON: {"items":[{"id":number,"tone":"Bullish|Bearish|Neutral","impact":"macro|sector|company","tickers":[],"summary":"..."}]}. ' +
    'tone = likely direction for broad US risk assets (Neutral if unclear). impact = macro (rates, inflation, central banks, jobs, oil, geopolitics), sector, or company. ' +
    `tickers: only assets that the headline names or unmistakably implies (list: ${CORE_SYMBOLS.join(', ')}; or a US stock ticker for a named company). Do NOT map a company to a sector ETF; use [] if unsure. ` +
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
        // gpt-oss is a reasoning model: keep its thinking short so the free tier's tokens-per-minute limit lasts.
        ...(MODEL().includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    }),
    20000,
  );
  if (!res) return { reads: [], error: 'Groq request timed out' };
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message ?? ''; } catch { /* body was not JSON */ }
    // 400 = this one batch produced bad JSON: skip it, later batches may be fine. 401/404/429 will repeat, so stop.
    return { reads: [], error: `Groq HTTP ${res.status}${msg ? ': ' + msg : ''}`.slice(0, 300), retryable: res.status === 400 };
  }
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
    return { reads: out };
  } catch {
    return { reads: [], error: 'Groq returned something that is not the expected JSON', retryable: true };
  }
}
