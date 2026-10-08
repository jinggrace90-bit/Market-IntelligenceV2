-- Run AFTER the site is deployed on Vercel, in Supabase → SQL Editor.
-- 1) Replace YOUR_SITE (e.g. market-intelligence-v2.vercel.app) and YOUR_CRON_SECRET below.
-- 2) The secret must equal the CRON_SECRET environment variable you set on Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- helper: POST to a cron route with the bearer secret
create or replace function mi_call(path text) returns void language sql as $$
  select net.http_post(
    url := 'https://YOUR_SITE' || path,
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$;

select cron.schedule('mi-news',      '*/10 * * * *', $$select mi_call('/api/cron/news')$$);
select cron.schedule('mi-quotes',    '*/5 * * * *',  $$select mi_call('/api/cron/quotes')$$);
select cron.schedule('mi-sentiment', '5 * * * *',    $$select mi_call('/api/cron/sentiment')$$);
select cron.schedule('mi-calendar',  '15 */6 * * *', $$select mi_call('/api/cron/calendar')$$);
select cron.schedule('mi-daily',     '30 22 * * *',  $$select mi_call('/api/cron/daily')$$);  -- UTC; needs EULERPOOL_API_KEY on Vercel

-- To check:   select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 10;
-- To remove:  select cron.unschedule('mi-news');
