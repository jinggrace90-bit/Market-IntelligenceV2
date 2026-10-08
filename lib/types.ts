export type Session = 'us' | 'fut' | 'crypto' | 'hk';

export interface Inst {
  id: string;
  y: string; // Yahoo symbol
  short: string;
  name: string;
  kind: string;
  group: string;
  dp: number;
  unit: string;
  sess: Session;
  driver: string;
  delayed?: boolean;
  exch?: string;
  sector?: string;
  sectorShort?: string;
}

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  prevClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  wk52Low: number | null;
  wk52High: number | null;
  marketState: string | null;
  asOf: string; // ISO time of the exchange quote
  source: string;
}

export interface QuoteResponse {
  quotes: Record<string, Quote>;
  fetchedAt: string;
  stale: boolean;
}

export interface ChartResponse {
  symbol: string;
  range: string;
  points: [number, number][]; // [epoch ms, close]
  prevClose: number | null;
  tz: string | null;
  source: string;
  asOf: string;
  stale: boolean;
}

export interface NewsItem {
  id: number;
  url: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string;
  tickers: string[] | null;
  ai_tone: string | null;
  ai_impact: string | null;
  ai_summary: string | null;
}

export interface SentimentRow {
  kind: string;
  value: number;
  label: string;
  source: string;
  as_of: string;
  fetched_at: string;
}

export interface EconEvent {
  id: string;
  ts: string;
  country: string;
  name: string;
  impact: number;
  actual: string | null;
  forecast: string | null;
  prior: string | null;
  source: string;
}

export interface EarningsEvent {
  symbol: string;
  report_date: string; // YYYY-MM-DD, the company's report day (no time of day from the source)
  eps_est: number | null;
  rev_est: number | null;
  source: string;
}

export interface InitialData {
  quotes: Record<string, Quote>;
  quotesFetchedAt: string | null;
  news: NewsItem[];
  sentiment: Record<string, SentimentRow>;
  events: EconEvent[];
  earnings: EarningsEvent[];
}
