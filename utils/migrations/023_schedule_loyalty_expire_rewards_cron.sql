-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule loyalty_expire_rewards to run daily at 2 AM UTC
-- This will check for expired rewards and mark them as expired
SELECT cron.schedule(
  'loyalty-expire-rewards-daily',           -- job name
  '0 2 * * *',                              -- cron expression (2 AM UTC daily)
  'SELECT loyalty_expire_rewards();'        -- SQL to execute
);

-- Note: To unschedule if needed:
-- SELECT cron.unschedule('loyalty-expire-rewards-daily');

-- Note: To view all scheduled jobs:
-- SELECT * FROM cron.job;
