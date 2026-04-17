-- Migration: sync prod schema with staging
-- Generated from schema diff: staging vs prod
-- All statements use ADD COLUMN IF NOT EXISTS for idempotency

-- device_heartbeats: add missing timestamp columns
ALTER TABLE public.device_heartbeats
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- inventory_items: add reorder_quantity
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS reorder_quantity numeric;

-- location_inventory_overrides: add cost_per_unit, reorder_point
ALTER TABLE public.location_inventory_overrides
  ADD COLUMN IF NOT EXISTS cost_per_unit numeric,
  ADD COLUMN IF NOT EXISTS reorder_point numeric;

-- locations: add business_day_start_hour
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint DEFAULT 0;

-- online_store_config: add setup workflow columns
ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS setup_request_status text NOT NULL DEFAULT 'setup_completed',
  ADD COLUMN IF NOT EXISTS setup_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_requested_by text,
  ADD COLUMN IF NOT EXISTS setup_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_reviewed_by text,
  ADD COLUMN IF NOT EXISTS setup_rejection_reason text,
  ADD COLUMN IF NOT EXISTS setup_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- order_payments: add settlement_batch_id FK
ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS settlement_batch_id uuid;

-- payment_terminals: add castles integration columns
ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS castles_ip_address text,
  ADD COLUMN IF NOT EXISTS castles_last_pos_txn_id text NOT NULL DEFAULT '000000',
  ADD COLUMN IF NOT EXISTS castles_port integer NOT NULL DEFAULT 8080;

-- receipt_templates: add new display options
ALTER TABLE public.receipt_templates
  ADD COLUMN IF NOT EXISTS group_by_seat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_approved_by boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_break_details boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_void_reason boolean DEFAULT false;

-- settlement_batches: add missing columns
ALTER TABLE public.settlement_batches
  ADD COLUMN IF NOT EXISTS payment_terminal_id uuid,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS business_date_start date,
  ADD COLUMN IF NOT EXISTS business_date_end date,
  ADD COLUMN IF NOT EXISTS castles_pos_txn_id text,
  ADD COLUMN IF NOT EXISTS castles_return_code text,
  ADD COLUMN IF NOT EXISTS castles_batch_num text,
  ADD COLUMN IF NOT EXISTS castles_settle_info jsonb;

-- settlement_batches: fix amount column types (integer → numeric)
-- COALESCE ensures nulls don't break the cast
ALTER TABLE public.settlement_batches
  ALTER COLUMN gross_amount TYPE numeric(10,2) USING COALESCE(gross_amount, 0)::numeric,
  ALTER COLUMN tip_amount TYPE numeric(10,2) USING COALESCE(tip_amount, 0)::numeric,
  ALTER COLUMN refund_amount TYPE numeric(10,2) USING COALESCE(refund_amount, 0)::numeric,
  ALTER COLUMN interchange_fees TYPE numeric(10,2) USING COALESCE(interchange_fees, 0)::numeric,
  ALTER COLUMN assessment_fees TYPE numeric(10,2) USING COALESCE(assessment_fees, 0)::numeric,
  ALTER COLUMN processor_fees TYPE numeric(10,2) USING COALESCE(processor_fees, 0)::numeric,
  ALTER COLUMN net_deposit TYPE numeric(10,2) USING COALESCE(net_deposit, 0)::numeric;

-- settlement_batches: update status constraint to include new statuses
ALTER TABLE public.settlement_batches
  DROP CONSTRAINT IF EXISTS valid_batch_status,
  DROP CONSTRAINT IF EXISTS chk_settlement_status;

ALTER TABLE public.settlement_batches
  ADD CONSTRAINT chk_settlement_status CHECK (
    status::text = ANY (ARRAY[
      'open', 'pending', 'settling', 'settled',
      'partial_failure', 'retry', 'failed',
      'terminal_unavailable', 'closed'
    ])
  );

-- tip_distribution_details: add staff_name denormalized column
ALTER TABLE public.tip_distribution_details
  ADD COLUMN IF NOT EXISTS staff_name text;