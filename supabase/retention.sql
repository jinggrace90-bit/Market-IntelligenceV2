-- Keeps the free Supabase database small (free plan = 500 MB). Run once in Supabase -> SQL Editor.
-- Deletes old rows every Sunday 03:00 UTC. Safe: only intraday candles and old headlines are removed.

select cron.schedule('mi-retention', '0 3 * * 0', $$
  delete from candles where interval in ('5m','15m','1h') and ts < now() - interval '45 days';
  delete from news where published_at < now() - interval '60 days';
  delete from earnings_events where report_date < current_date - 30;
  delete from econ_events where ts < now() - interval '30 days';
$$);

-- Remove it later with: select cron.unschedule('mi-retention');
