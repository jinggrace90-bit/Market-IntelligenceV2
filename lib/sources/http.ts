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
