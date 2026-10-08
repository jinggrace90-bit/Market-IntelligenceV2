import { XMLParser } from 'fast-xml-parser';
import { fetchText } from './http';

export interface RssItem {
  url: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string;
}

const FEEDS: { source: string; url: string }[] = [
  { source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { source: 'CNBC', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html' },
  { source: 'Investing.com', url: 'https://www.investing.com/rss/news.rss' },
  { source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'FT', url: 'https://www.ft.com/markets?format=rss' },
];

const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, htmlEntities: true });

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as any)['#text']);
  return String(v);
}

function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function clean(s: string): string {
  return decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function readFeed(feed: { source: string; url: string }): Promise<RssItem[]> {
  const xml = await fetchText(feed.url);
  if (!xml) return [];
  try {
    const doc = parser.parse(xml);
    const raw = doc?.rss?.channel?.item;
    const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const out: RssItem[] = [];
    for (const it of items) {
      const url = text(it.link).trim() || text(it.guid).trim();
      const title = clean(text(it.title));
      const d = new Date(text(it.pubDate));
      if (!url.startsWith('http') || !title || Number.isNaN(d.getTime())) continue;
      const summary = clean(text(it.description)).slice(0, 400) || null;
      out.push({ url, title, summary, source: feed.source, published_at: d.toISOString() });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchAllNews(): Promise<RssItem[]> {
  const lists = await Promise.all(FEEDS.map(readFeed));
  const seen = new Set<string>();
  const all: RssItem[] = [];
  for (const it of lists.flat()) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    all.push(it);
  }
  return all.sort((a, b) => b.published_at.localeCompare(a.published_at));
}
