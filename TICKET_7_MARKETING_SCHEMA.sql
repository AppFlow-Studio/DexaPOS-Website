-- TICKET 7: DEXA-CUST-007 — Marketing Tab
-- Tables: marketing_campaigns, marketing_recipients
-- Columns: customer preferences (sms_opt_in, email_opt_in, etc)

-- 1. Add marketing preference columns to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_unsubscribed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS email_opt_in_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS receipt_via_sms BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_via_email BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en'; -- en, es, fr, etc

-- 2. Create marketing_campaigns table
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES merchants(id),

  name            TEXT NOT NULL,
  campaign_type   TEXT NOT NULL,           -- 'sms', 'email'

  -- Content
  subject         TEXT,                    -- Email subject (null for SMS)
  body            TEXT NOT NULL,           -- Message body with {{merge_tags}}

  -- Audience
  audience_type   TEXT NOT NULL DEFAULT 'all', -- 'all', 'tag', 'segment', 'manual'
  audience_tags   TEXT[],                  -- If tag-based: customers with these tags
  audience_filter JSONB,                  -- If segment: { min_spend, last_visit_days, etc }

  -- Scheduling
  status          TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, sending, sent, cancelled
  scheduled_for   TIMESTAMP WITH TIME ZONE,
  sent_at         TIMESTAMP WITH TIME ZONE,

  -- Stats
  total_recipients INTEGER DEFAULT 0,
  total_delivered  INTEGER DEFAULT 0,
  total_opened     INTEGER DEFAULT 0,      -- Email only
  total_clicked    INTEGER DEFAULT 0,      -- If links in message
  total_bounced    INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,

  created_by      TEXT REFERENCES users(id),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for marketing_campaigns
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_merchant ON marketing_campaigns(merchant_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_created ON marketing_campaigns(created_at);

-- 3. Create marketing_recipients table
CREATE TABLE IF NOT EXISTS marketing_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id),

  channel         TEXT NOT NULL,           -- 'sms' or 'email'
  destination     TEXT NOT NULL,           -- Phone or email sent to

  status          TEXT NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed, bounced, unsubscribed
  sent_at         TIMESTAMP WITH TIME ZONE,
  delivered_at    TIMESTAMP WITH TIME ZONE,
  opened_at       TIMESTAMP WITH TIME ZONE,
  clicked_at      TIMESTAMP WITH TIME ZONE,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  error_message   TEXT,

  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for marketing_recipients
CREATE INDEX IF NOT EXISTS idx_marketing_recipients_customer ON marketing_recipients(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_recipients_campaign ON marketing_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_recipients_status ON marketing_recipients(status);
CREATE INDEX IF NOT EXISTS idx_marketing_recipients_created ON marketing_recipients(created_at);

-- 4. Add RLS policies for marketing_campaigns
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view their own campaigns"
  ON marketing_campaigns FOR SELECT
  USING (merchant_id = auth.uid());

CREATE POLICY "Merchants can insert their own campaigns"
  ON marketing_campaigns FOR INSERT
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Merchants can update their own campaigns"
  ON marketing_campaigns FOR UPDATE
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

CREATE POLICY "Merchants can delete their own campaigns"
  ON marketing_campaigns FOR DELETE
  USING (merchant_id = auth.uid());

-- 5. Add RLS policies for marketing_recipients
ALTER TABLE marketing_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipients for their campaigns"
  ON marketing_recipients FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM marketing_campaigns WHERE merchant_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert recipients for their campaigns"
  ON marketing_recipients FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM marketing_campaigns WHERE merchant_id = auth.uid()
    )
  );

CREATE POLICY "Users can update recipients for their campaigns"
  ON marketing_recipients FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM marketing_campaigns WHERE merchant_id = auth.uid()
    )
  );
