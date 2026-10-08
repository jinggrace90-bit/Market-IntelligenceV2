import Dashboard from '@/components/Dashboard';
import * as store from '@/lib/store';
import type { InitialData } from '@/lib/types';

// ISR: the page itself only ever reads our own database (CLAUDE.md #2) and is rebuilt at most every 60s.
export const revalidate = 60;

async function load(): Promise<InitialData> {
  const day = 86400000;
  const now = Date.now();
  try {
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const [saved, news, sentiment, events, earnings] = await Promise.all([
      store.getQuotes(),
      store.getNews(40),
      store.getSentiment(),
      store.getEvents(new Date(now - 8 * day).toISOString(), new Date(now + 9 * day).toISOString()),
      store.getEarnings(iso(now - day), iso(now + 15 * day)),
    ]);
    let newest = 0;
    const quotes: InitialData['quotes'] = {};
    for (const [k, { fetchedAt, ...q }] of Object.entries(saved)) {
      quotes[k] = q;
      newest = Math.max(newest, new Date(fetchedAt).getTime());
    }
    return { quotes, quotesFetchedAt: newest ? new Date(newest).toISOString() : null, news, sentiment, events, earnings };
  } catch {
    return { quotes: {}, quotesFetchedAt: null, news: [], sentiment: {}, events: [], earnings: [] };
  }
}

export default async function Page() {
  return <Dashboard initial={await load()} />;
}
