-- Market Intelligence V2 — run once in Supabase → SQL Editor.
-- Based on ARCHITECTURE.md §4, plus three extra columns on quotes_latest (52-week range, market state).

create table if not exists quotes_latest (
  symbol text primary key,
  yahoo_symbol text not null,
  price numeric not null,
  change numeric, change_pct numeric, prev_close numeric,
  day_low numeric, day_high numeric,
  wk52_low numeric, wk52_high numeric, market_state text,
  source text not null, as_of timestamptz not null, fetched_at timestamptz not null default now()
);

create table if not exists candles (
  symbol text, interval text, ts timestamptz,
  o numeric, h numeric, l numeric, c numeric, v numeric,
  source text not null,
  primary key (symbol, interval, ts)
);

create table if not exists news (
  id bigserial primary key,
  url text unique not null,
  title text not null, summary text, source text not null,
  published_at timestamptz not null,
  tickers text[], region text,
  ai_tone text, ai_impact text, ai_summary text, analyzed_at timestamptz
);
create index if not exists news_published_idx on news (published_at desc);

create table if not exists sentiment (
  kind text primary key,
  value int not null, label text not null,
  source text not null, as_of timestamptz not null, fetched_at timestamptz not null default now()
);

create table if not exists econ_events (
  id text primary key,
  ts timestamptz not null, country text not null, name text not null,
  impact smallint not null,
  actual text, forecast text, prior text, source text not null
);
create index if not exists econ_events_ts_idx on econ_events (ts);

create table if not exists earnings_events (
  symbol text, report_date date, eps_est numeric, eps_actual numeric,
  rev_est numeric, rev_actual numeric, source text not null,
  primary key (symbol, report_date)
);

-- SECURITY: turn on Row Level Security and add NO policies.
-- The public "anon" key can then read/write nothing. Our server uses the service-role key,
-- which bypasses RLS. Without this, anyone with your anon key could edit these tables.
alter table quotes_latest enable row level security;
alter table candles enable row level security;
alter table news enable row level security;
alter table sentiment enable row level security;
alter table econ_events enable row level security;
alter table earnings_events enable row level security;
