-- Use this if the scheduled jobs return 401 (the secret in the database does not match Vercel's CRON_SECRET).
-- Run it in Supabase -> SQL Editor. It replaces ONLY the helper function; the schedules stay as they are.
-- 1) Replace PASTE_YOUR_CRON_SECRET_HERE with the exact value of CRON_SECRET from Vercel (keep the quotes).
-- 2) Do NOT save the real secret into this file or commit it to git; edit it only in the Supabase editor.

create or replace function mi_call(path text) returns void language sql as $$
  select net.http_post(
    url := 'https://market-intelligence-v2-lyart.vercel.app' || path,
    headers := jsonb_build_object('Authorization', 'Bearer PASTE_YOUR_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$;

-- Test it right away, then check the result (expect status_code 200):
--   select mi_call('/api/cron/sentiment');
--   select id, status_code, left(content::text, 120) as response, created from net._http_response order by created desc limit 5;
