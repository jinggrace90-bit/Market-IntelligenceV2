// Shared fetch helpers. Rule (CLAUDE.md #3): 5s timeout, never throw, return null on failure.
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function fetchText(url: string, init: RequestInit = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': BROWSER_UA, ...(init.headers ?? {}) },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  const text = await fetchText(url, init);
  if (text == null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null) as Promise<T | null>;
}

/** Like fetchJson, but also reports why it failed ("HTTP 418", "timeout", "not JSON"). Never throws. */
export async function fetchJsonDiag<T>(url: string, init: RequestInit = {}): Promise<{ data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000), headers: { 'user-agent': BROWSER_UA, ...(init.headers ?? {}) } });
    if (!res.ok) return { data: null, error: `HTTP ${res.status}` };
    const text = await res.text();
    try {
      return { data: JSON.parse(text) as T };
    } catch {
      return { data: null, error: `not JSON (${text.slice(0, 40).replace(/\s+/g, ' ')})` };
    }
  } catch (e) {
    return { data: null, error: (e as Error).name === 'TimeoutError' ? 'timeout' : `network: ${(e as Error).message}`.slice(0, 80) };
  }
}
