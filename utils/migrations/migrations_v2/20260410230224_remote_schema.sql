create extension if not exists "moddatetime" with schema "public";

drop policy "Merchant admins can manage items in categories" on "public"."category_items";

drop policy "allow auth merchants to insert" on "public"."category_items";

drop policy "allow auth merchants to update" on "public"."category_items";

drop policy "device_assignments_select_carrier" on "public"."device_assignments";

drop policy "device_assignments_select_hq" on "public"."device_assignments";

drop policy "device_assignments_select_merchant" on "public"."device_assignments";

drop policy "device_config_history_select_carrier" on "public"."device_config_history";

drop policy "device_config_history_select_hq" on "public"."device_config_history";

drop policy "device_config_history_select_merchant" on "public"."device_config_history";

drop policy "device_inventory_select_carrier" on "public"."device_inventory";

drop policy "device_inventory_select_hq" on "public"."device_inventory";

drop policy "device_inventory_select_merchant" on "public"."device_inventory";

drop policy "Merchants can view their device login history" on "public"."device_login_history";

drop policy "device_notes_select_carrier" on "public"."device_notes";

drop policy "device_notes_select_hq" on "public"."device_notes";

drop policy "device_notes_select_merchant" on "public"."device_notes";

drop policy "inventory_items_all" on "public"."inventory_items";

drop policy "location_inventory_overrides_all" on "public"."location_inventory_overrides";

drop policy "location_inventory_stock_all" on "public"."location_inventory_stock";

drop policy "location_vendor_pricing_all" on "public"."location_vendor_pricing";

drop policy "location_vendors_all" on "public"."location_vendors";

drop policy "Allow insert for auth merchants" on "public"."menu_categories";

drop policy "Merchant Admins Can Update" on "public"."menu_categories";

drop policy "Merchant admins can manage menu item discounts" on "public"."menu_item_discounts";

drop policy "read_access" on "public"."menu_item_discounts";

drop policy "mbp_carrier_admin_read" on "public"."merchant_billing_profiles";

drop policy "mbp_hq_admin_all" on "public"."merchant_billing_profiles";

drop policy "mbp_merchant_owner_rw" on "public"."merchant_billing_profiles";

drop policy "Carriers can access their own merchants or if they are part of " on "public"."merchants";

drop policy "Enable delete access for authenticated users" on "public"."modifier_group_item_recipes";

drop policy "Enable insert access for authenticated users" on "public"."modifier_group_item_recipes";

drop policy "Enable read access for authenticated users" on "public"."modifier_group_item_recipes";

drop policy "Enable update access for authenticated users" on "public"."modifier_group_item_recipes";

drop policy "oo_sync_results_select_own" on "public"."orderout_menu_sync_results";

drop policy "merchant_select_orders" on "public"."orders";

drop policy "Merchants can view their terminals" on "public"."payment_terminals";

drop policy "purchase_order_items_all" on "public"."purchase_order_items";

drop policy "purchase_order_payments_all" on "public"."purchase_order_payments";

drop policy "purchase_orders_all" on "public"."purchase_orders";

drop policy "Manager can delete staff" on "public"."staff_profiles";

drop policy "staff_profiles_delete" on "public"."staff_profiles";

drop policy "staff_profiles_insert" on "public"."staff_profiles";

drop policy "staff_profiles_select" on "public"."staff_profiles";

drop policy "staff_profiles_update" on "public"."staff_profiles";

drop policy "Merchants can view their devices" on "public"."station_devices";

drop policy "Users can view sessions for their merchant" on "public"."station_sessions";

drop policy "Merchants can view their stations" on "public"."stations";

drop policy "stock_update_log_all" on "public"."stock_update_log";

drop policy "admin_see_all_tickets" on "public"."support_tickets";

drop policy "merchants_own_tickets" on "public"."support_tickets";

drop policy "vendor_items_all" on "public"."vendor_items";

drop policy "vendors_all" on "public"."vendors";

drop policy "Users can delete their own notes" on "public"."customer_notes";

drop policy "Users can insert notes for customers in their merchant" on "public"."customer_notes";

drop policy "Users can update their own notes" on "public"."customer_notes";

drop policy "Users can view notes for customers in their merchant" on "public"."customer_notes";

drop policy "lbp_carrier_admin_read" on "public"."location_banking_profiles";

drop policy "lbp_hq_admin_all" on "public"."location_banking_profiles";

drop policy "lbp_merchant_owner_rw" on "public"."location_banking_profiles";

drop policy "Merchants can delete their own campaigns" on "public"."marketing_campaigns";

drop policy "Merchants can insert their own campaigns" on "public"."marketing_campaigns";

drop policy "Merchants can update their own campaigns" on "public"."marketing_campaigns";

drop policy "Merchants can view their own campaigns" on "public"."marketing_campaigns";

drop policy "Users can insert recipients for their campaigns" on "public"."marketing_recipients";

drop policy "Users can update recipients for their campaigns" on "public"."marketing_recipients";

drop policy "Users can view recipients for their campaigns" on "public"."marketing_recipients";

revoke delete on table "public"."orderout_menu_sync_results" from "anon";

revoke insert on table "public"."orderout_menu_sync_results" from "anon";

revoke references on table "public"."orderout_menu_sync_results" from "anon";

revoke select on table "public"."orderout_menu_sync_results" from "anon";

revoke trigger on table "public"."orderout_menu_sync_results" from "anon";

revoke truncate on table "public"."orderout_menu_sync_results" from "anon";

revoke update on table "public"."orderout_menu_sync_results" from "anon";

revoke delete on table "public"."orderout_menu_sync_results" from "authenticated";

revoke insert on table "public"."orderout_menu_sync_results" from "authenticated";

revoke references on table "public"."orderout_menu_sync_results" from "authenticated";

revoke select on table "public"."orderout_menu_sync_results" from "authenticated";

revoke trigger on table "public"."orderout_menu_sync_results" from "authenticated";

revoke truncate on table "public"."orderout_menu_sync_results" from "authenticated";

revoke update on table "public"."orderout_menu_sync_results" from "authenticated";

revoke delete on table "public"."orderout_menu_sync_results" from "service_role";

revoke insert on table "public"."orderout_menu_sync_results" from "service_role";

revoke references on table "public"."orderout_menu_sync_results" from "service_role";

revoke select on table "public"."orderout_menu_sync_results" from "service_role";

revoke trigger on table "public"."orderout_menu_sync_results" from "service_role";

revoke truncate on table "public"."orderout_menu_sync_results" from "service_role";

revoke update on table "public"."orderout_menu_sync_results" from "service_role";

alter table "public"."orderout_menu_sync_results" drop constraint "orderout_menu_sync_results_sync_id_fkey";

alter table "public"."orderout_menu_sync_results" drop constraint "uq_sync_result";

alter table "public"."orderout_menu_syncs" drop constraint "orderout_menu_syncs_sync_direction_check";

drop function if exists "public"."correlate_push_channels_callback"(p_oo_menu_id text, p_oo_restaurant_id text, p_delivery_service text, p_status text, p_status_code integer, p_error_message text, p_raw_response jsonb);

drop function if exists "public"."reconcile_stuck_push_channels_syncs"(p_stale_minutes integer);

alter table "public"."orderout_menu_sync_results" drop constraint "orderout_menu_sync_results_pkey";

drop index if exists "public"."idx_category_items_category";

drop index if exists "public"."idx_category_items_item";

drop index if exists "public"."idx_customers_merchant";

drop index if exists "public"."idx_location_overrides_location";

drop index if exists "public"."idx_locations_merchant";

drop index if exists "public"."idx_ltx_order";

drop index if exists "public"."idx_lvp_location";

drop index if exists "public"."idx_menu_categories_menu";

drop index if exists "public"."idx_menu_item_recipes_menu_item";

drop index if exists "public"."idx_menu_items_merchant";

drop index if exists "public"."idx_merchants_clerk_org";

drop index if exists "public"."idx_oo_menu_syncs_push_channels_active";

drop index if exists "public"."idx_order_items_order";

drop index if exists "public"."idx_order_payment_items_payment";

drop index if exists "public"."idx_order_payments_order";

drop index if exists "public"."idx_payment_events_payment";

drop index if exists "public"."idx_po_merchant";

drop index if exists "public"."idx_stock_log_merchant";

drop index if exists "public"."idx_sync_results_sync_id";

drop index if exists "public"."idx_table_sessions_order";

drop index if exists "public"."idx_tip_dist_session";

drop index if exists "public"."idx_tip_dist_session_role";

drop index if exists "public"."orderout_menu_sync_results_pkey";

drop index if exists "public"."uq_kds_item_status_display_item";

drop index if exists "public"."uq_sync_result";

drop table "public"."orderout_menu_sync_results";


  -- create table "public"."location_payment_devices" (
  --   "id" uuid not null default gen_random_uuid(),
  --   "merchant_id" uuid not null,
  --   "carrier_id" uuid not null,
  --   "location_id" uuid not null,
  --   "provider" text not null default 'dejavoo'::text,
  --   "device_label" text,
  --   "tpn" text not null,
  --   "ftd_ecom_key_secret_id" uuid not null,
  --   "whitelist_origins" text[] not null default '{}'::text[],
  --   "whitelist_synced_at" timestamp with time zone,
  --   "last_synced_from_crm_at" timestamp with time zone,
  --   "is_active" boolean not null default true,
  --   "use_for_online_ordering" boolean not null default false,
  --   "created_at" timestamp with time zone not null default now(),
  --   "updated_at" timestamp with time zone not null default now()
  --     );


alter table "public"."location_payment_devices" enable row level security;


  -- create table "public"."payment_credential_access_log" (
  --   "id" uuid not null default gen_random_uuid(),
  --   "device_id" uuid not null,
  --   "function_name" text not null,
  --   "store_config_id" uuid,
  --   "actor_user_id" text,
  --   "called_at" timestamp with time zone not null default now(),
  --   "metadata" jsonb not null default '{}'::jsonb
  --     );


alter table "public"."payment_credential_access_log" enable row level security;

alter table "public"."device_heartbeats" add column "created_at" timestamp with time zone not null default now();

alter table "public"."device_heartbeats" add column "updated_at" timestamp with time zone not null default now();

-- alter table "public"."online_store_config" add column "ipospays_ftd_ecom_key" text;

alter table "public"."order_payments" add column "settlement_batch_id" uuid;

alter table "public"."orderout_menu_syncs" drop column "expected_channels";

alter table "public"."orderout_menu_syncs" drop column "trigger_source";

alter table "public"."orderout_menu_syncs" drop column "triggered_by_user_id";

alter table "public"."payment_terminals" add column "castles_ip_address" text;

alter table "public"."payment_terminals" add column "castles_last_pos_txn_id" text not null default '000000'::text;

alter table "public"."payment_terminals" add column "castles_port" integer not null default 8080;

alter table "public"."settlement_batches" add column "business_date_end" date;

alter table "public"."settlement_batches" add column "business_date_start" date;

alter table "public"."settlement_batches" add column "castles_batch_num" text;

alter table "public"."settlement_batches" add column "castles_pos_txn_id" text;

alter table "public"."settlement_batches" add column "castles_return_code" text;

alter table "public"."settlement_batches" add column "castles_settle_info" jsonb;

alter table "public"."settlement_batches" add column "failure_reason" text;

alter table "public"."settlement_batches" add column "last_attempt_at" timestamp with time zone;

alter table "public"."settlement_batches" add column "payment_terminal_id" uuid;

alter table "public"."settlement_batches" add column "retry_count" integer not null default 0;

alter table "public"."settlement_batches" alter column "assessment_fees" set data type numeric(10,2) using "assessment_fees"::numeric(10,2);

alter table "public"."settlement_batches" alter column "gross_amount" set data type numeric(10,2) using "gross_amount"::numeric(10,2);

alter table "public"."settlement_batches" alter column "interchange_fees" set data type numeric(10,2) using "interchange_fees"::numeric(10,2);

alter table "public"."settlement_batches" alter column "net_deposit" set data type numeric(10,2) using "net_deposit"::numeric(10,2);

alter table "public"."settlement_batches" alter column "processor_fees" set data type numeric(10,2) using "processor_fees"::numeric(10,2);

alter table "public"."settlement_batches" alter column "refund_amount" set data type numeric(10,2) using "refund_amount"::numeric(10,2);

alter table "public"."settlement_batches" alter column "tip_amount" set data type numeric(10,2) using "tip_amount"::numeric(10,2);

CREATE UNIQUE INDEX IF NOT EXISTS device_heartbeats_station_id_key ON public.device_heartbeats USING btree (station_id);

CREATE INDEX IF NOT EXISTS idx_kds_displays_location_id ON public.kds_displays USING btree (location_id);

CREATE INDEX IF NOT EXISTS idx_kds_displays_merchant_id ON public.kds_displays USING btree (merchant_id);

CREATE INDEX IF NOT EXISTS idx_kds_item_status_bumped_by ON public.kds_item_status USING btree (bumped_by);

CREATE INDEX IF NOT EXISTS idx_kds_item_status_order_item_id ON public.kds_item_status USING btree (order_item_id);

CREATE INDEX IF NOT EXISTS idx_location_payment_devices_carrier ON public.location_payment_devices USING btree (carrier_id);

CREATE INDEX IF NOT EXISTS idx_location_payment_devices_location ON public.location_payment_devices USING btree (merchant_id, location_id);

CREATE INDEX IF NOT EXISTS idx_order_courses_fired_by ON public.order_courses USING btree (fired_by);

CREATE INDEX IF NOT EXISTS idx_order_discounts_applied_by_staff_id ON public.order_discounts USING btree (applied_by_staff_profiles_id);

CREATE INDEX IF NOT EXISTS idx_order_discounts_approved_by_staff_id ON public.order_discounts USING btree (approved_by_staff_profiles_id);

CREATE INDEX IF NOT EXISTS idx_order_discounts_voided_by ON public.order_discounts USING btree (voided_by);

CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_modifier_group_id ON public.order_item_modifiers USING btree (modifier_group_id);

CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_modifier_item_id ON public.order_item_modifiers USING btree (modifier_item_id);

CREATE INDEX IF NOT EXISTS idx_order_items_assigned_to_staff_id ON public.order_items USING btree (assigned_to_staff_id);

CREATE INDEX IF NOT EXISTS idx_order_items_discount_applied_by ON public.order_items USING btree (discount_applied_by);

CREATE INDEX IF NOT EXISTS idx_order_items_discount_approved_by ON public.order_items USING btree (discount_approved_by);

CREATE INDEX IF NOT EXISTS idx_order_items_discount_id ON public.order_items USING btree (discount_id);

CREATE INDEX IF NOT EXISTS idx_order_items_location_exclusive_item_id ON public.order_items USING btree (location_exclusive_item_id);

CREATE INDEX IF NOT EXISTS idx_order_items_selected_size_id ON public.order_items USING btree (selected_size_id);

CREATE INDEX IF NOT EXISTS idx_order_items_voided_by ON public.order_items USING btree (voided_by);

CREATE INDEX IF NOT EXISTS idx_order_payments_initiated_by ON public.order_payments USING btree (initiated_by);

CREATE INDEX IF NOT EXISTS idx_order_payments_location_id ON public.order_payments USING btree (location_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_parent_payment_id ON public.order_payments USING btree (parent_payment_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_processed_by_staff_id ON public.order_payments USING btree (processed_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_processed_by_user_id ON public.order_payments USING btree (processed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_refunded_by ON public.order_payments USING btree (refunded_by);

CREATE INDEX IF NOT EXISTS idx_order_payments_returned_by ON public.order_payments USING btree (returned_by);

CREATE INDEX IF NOT EXISTS idx_order_payments_settlement_batch ON public.order_payments USING btree (settlement_batch_id) WHERE (settlement_batch_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_order_payments_tip_adjusted_by ON public.order_payments USING btree (tip_adjusted_by);

CREATE INDEX IF NOT EXISTS idx_order_payments_unsettled_terminal ON public.order_payments USING btree (terminal_id, status) WHERE ((is_settled = false) AND (settlement_batch_id IS NULL));

CREATE INDEX IF NOT EXISTS idx_order_payments_voided_by ON public.order_payments USING btree (voided_by);

CREATE INDEX IF NOT EXISTS idx_order_refund_items_order_payment_item_id ON public.order_refund_items USING btree (order_payment_item_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by_staff_id ON public.order_status_history USING btree (changed_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by_user_id ON public.order_status_history USING btree (changed_by_user_id);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_server_id ON public.orders USING btree (assigned_server_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_by_staff_id ON public.orders USING btree (created_by_staff_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_by_user_id ON public.orders USING btree (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_orders_station_id ON public.orders USING btree (station_id);

CREATE INDEX IF NOT EXISTS idx_orders_voided_by ON public.orders USING btree (voided_by);

CREATE INDEX IF NOT EXISTS idx_payment_credential_access_log_device_called_at ON public.payment_credential_access_log USING btree (device_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_printers_merchant_id ON public.printers USING btree (merchant_id);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_terminal_status ON public.settlement_batches USING btree (payment_terminal_id, status) WHERE (payment_terminal_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_stations_deactivated_by ON public.stations USING btree (deactivated_by);

CREATE UNIQUE INDEX IF NOT EXISTS location_payment_devices_location_tpn_key ON public.location_payment_devices USING btree (location_id, tpn);

CREATE UNIQUE INDEX IF NOT EXISTS location_payment_devices_one_online_per_location ON public.location_payment_devices USING btree (location_id) WHERE ((use_for_online_ordering = true) AND (is_active = true));

CREATE UNIQUE INDEX IF NOT EXISTS location_payment_devices_pkey ON public.location_payment_devices USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_credential_access_log_pkey ON public.payment_credential_access_log USING btree (id);

alter table "public"."location_payment_devices" add constraint "location_payment_devices_pkey" PRIMARY KEY using index "location_payment_devices_pkey";

alter table "public"."payment_credential_access_log" add constraint "payment_credential_access_log_pkey" PRIMARY KEY using index "payment_credential_access_log_pkey";

alter table "public"."device_heartbeats" add constraint "device_heartbeats_station_id_key" UNIQUE using index "device_heartbeats_station_id_key";

alter table "public"."location_payment_devices" add constraint "location_payment_devices_carrier_id_fkey" FOREIGN KEY (carrier_id) REFERENCES public.carriers(id) ON DELETE CASCADE not valid;

alter table "public"."location_payment_devices" validate constraint "location_payment_devices_carrier_id_fkey";

alter table "public"."location_payment_devices" add constraint "location_payment_devices_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE not valid;

alter table "public"."location_payment_devices" validate constraint "location_payment_devices_location_id_fkey";

alter table "public"."location_payment_devices" add constraint "location_payment_devices_location_tpn_key" UNIQUE using index "location_payment_devices_location_tpn_key";

alter table "public"."location_payment_devices" add constraint "location_payment_devices_merchant_id_fkey" FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE not valid;

alter table "public"."location_payment_devices" validate constraint "location_payment_devices_merchant_id_fkey";

alter table "public"."location_payment_devices" add constraint "location_payment_devices_provider_check" CHECK ((provider = ANY (ARRAY['dejavoo'::text, 'ipospays'::text]))) not valid;

alter table "public"."location_payment_devices" validate constraint "location_payment_devices_provider_check";

alter table "public"."order_payments" add constraint "order_payments_settlement_batch_id_fkey" FOREIGN KEY (settlement_batch_id) REFERENCES public.settlement_batches(id) ON DELETE SET NULL not valid;

alter table "public"."order_payments" validate constraint "order_payments_settlement_batch_id_fkey";

alter table "public"."orderout_menu_syncs" add constraint "chk_menu_syncs_direction" CHECK ((sync_direction = ANY (ARRAY['push'::text, 'pull'::text]))) not valid;

alter table "public"."orderout_menu_syncs" validate constraint "chk_menu_syncs_direction";

alter table "public"."payment_credential_access_log" add constraint "payment_credential_access_log_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.location_payment_devices(id) ON DELETE CASCADE not valid;

alter table "public"."payment_credential_access_log" validate constraint "payment_credential_access_log_device_id_fkey";

alter table "public"."payment_credential_access_log" add constraint "payment_credential_access_log_store_config_id_fkey" FOREIGN KEY (store_config_id) REFERENCES public.online_store_config(id) ON DELETE SET NULL not valid;

alter table "public"."payment_credential_access_log" validate constraint "payment_credential_access_log_store_config_id_fkey";

alter table "public"."settlement_batches" add constraint "chk_settlement_status" CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'pending'::character varying, 'settling'::character varying, 'settled'::character varying, 'partial_failure'::character varying, 'retry'::character varying, 'failed'::character varying, 'terminal_unavailable'::character varying, 'closed'::character varying])::text[]))) not valid;

alter table "public"."settlement_batches" validate constraint "chk_settlement_status";

alter table "public"."settlement_batches" add constraint "settlement_batches_payment_terminal_id_fkey" FOREIGN KEY (payment_terminal_id) REFERENCES public.payment_terminals(id) ON DELETE SET NULL not valid;

alter table "public"."settlement_batches" validate constraint "settlement_batches_payment_terminal_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.finalize_castles_settlement(p_batch_uuid uuid, p_merchant_id uuid, p_castles_response jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch             record;
  v_return_code       text;
  v_final_status      text;
  v_settle_entry      jsonb;
  v_all_acquirers_ok  boolean := true;
  v_any_acquirer_ok   boolean := false;
  v_failed_acquirers  jsonb   := '[]'::jsonb;
  v_settled_acquirers jsonb   := '[]'::jsonb;
BEGIN

  -- ----------------------------------------------------------
  -- STEP 1: Fetch and lock the batch record.
  -- ----------------------------------------------------------
  SELECT * INTO v_batch
  FROM public.settlement_batches
  WHERE id = p_batch_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 2: Tenant isolation.
  -- ----------------------------------------------------------
  IF v_batch.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %',
      p_batch_uuid, p_merchant_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 3: Validate batch is in an expected state.
  -- We accept 'pending', 'settling', and 'retry' (for retries).
  -- Reject if already 'settled' to prevent double-settlement.
  -- ----------------------------------------------------------
  IF v_batch.status = 'settled' THEN
    RAISE EXCEPTION 'Batch % is already settled. Cannot finalize again.', p_batch_uuid;
  END IF;

  IF v_batch.status NOT IN ('pending', 'settling', 'retry', 'failed') THEN
    RAISE EXCEPTION 'Batch % is in status %. Expected pending/settling/retry/failed.',
      p_batch_uuid, v_batch.status;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 4: Read top-level return code.
  -- ----------------------------------------------------------
  v_return_code := p_castles_response->>'txnReturnCode';

  -- ----------------------------------------------------------
  -- STEP 5: Per-acquirer analysis of txnSettleInfo[].
  --
  -- WHY THIS IS CRITICAL: The top-level txnReturnCode can be
  -- E000000D (settlement fail) even when Visa settled and only
  -- AMEX failed. Without inspecting each entry in txnSettleInfo[],
  -- we'd incorrectly mark the entire batch as failed.
  --
  -- We build two lists:
  --   v_settled_acquirers: those with txnReturnCode = '00000000'
  --   v_failed_acquirers:  those with any other return code
  --
  -- This drives the final status:
  --   all OK          → 'settled'
  --   some OK, some failed → 'partial_failure'
  --   none OK, E000002A   → 'retry'
  --   none OK, other      → 'failed'
  -- ----------------------------------------------------------
  IF p_castles_response ? 'txnSettleInfo' THEN
    FOR v_settle_entry IN
      SELECT value FROM jsonb_array_elements(p_castles_response->'txnSettleInfo')
    LOOP
      IF (v_settle_entry->>'txnReturnCode') = '00000000' THEN
        v_any_acquirer_ok   := true;
        v_settled_acquirers := v_settled_acquirers || jsonb_build_array(
          v_settle_entry->>'txnAcquirerName'
        );
      ELSE
        v_all_acquirers_ok := false;
        v_failed_acquirers := v_failed_acquirers || jsonb_build_array(
          jsonb_build_object(
            'acquirer',    v_settle_entry->>'txnAcquirerName',
            'return_code', v_settle_entry->>'txnReturnCode',
            'message',     v_settle_entry->>'txnHostMsg'
          )
        );
      END IF;
    END LOOP;
  ELSE
    -- No txnSettleInfo array — treat top-level return code as the only signal.
    v_all_acquirers_ok := (v_return_code = '00000000');
    v_any_acquirer_ok  := v_all_acquirers_ok;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 6: Determine final batch status.
  -- ----------------------------------------------------------
  v_final_status := CASE
    WHEN v_all_acquirers_ok                       THEN 'settled'
    WHEN v_any_acquirer_ok AND NOT v_all_acquirers_ok THEN 'partial_failure'
    WHEN v_return_code = 'E000002A'               THEN 'retry'
    ELSE                                               'failed'
  END;

  -- ----------------------------------------------------------
  -- STEP 7: Update the settlement batch record.
  -- ----------------------------------------------------------
  UPDATE public.settlement_batches
  SET
    status               = v_final_status,
    closed_at            = CASE WHEN v_final_status IN ('settled', 'partial_failure') THEN NOW() ELSE closed_at END,
    settlement_date      = CASE WHEN v_final_status IN ('settled', 'partial_failure') THEN CURRENT_DATE ELSE settlement_date END,
    retry_count          = retry_count + 1,
    last_attempt_at      = NOW(),
    castles_return_code  = v_return_code,
    castles_batch_num    = p_castles_response->>'txnBatchNum',
    castles_settle_info  = p_castles_response->'txnSettleInfo',
    raw_response         = p_castles_response,
    failure_reason       = CASE
      WHEN v_final_status IN ('settled')     THEN NULL
      WHEN v_final_status = 'partial_failure'
        THEN 'Partial settlement: '
          || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_failed_acquirers)), ', ')
          || ' failed. Contact processor support.'
      WHEN v_return_code = 'E000002A'        THEN 'Castles requested a retry (E000002A). Call prepare again with a new txnPosTxnId.'
      ELSE p_castles_response->>'txnHostMsg'
    END,
    updated_at           = NOW()
  WHERE id = p_batch_uuid;

  -- ----------------------------------------------------------
  -- STEP 8: Mark payments as settled (for full or partial success).
  --
  -- For 'settled': mark ALL tagged payments.
  -- For 'partial_failure': we still mark all payments settled
  --   because the terminal batched them out — even if AMEX timed out,
  --   the transactions left the terminal. The merchant reconciles
  --   with the acquirer separately. This matches real-world POS
  --   behavior (Toast, Square do the same).
  -- For 'retry' / 'failed': payments stay unsettled and remain
  --   tagged to this batch (for audit). The next prepare() call
  --   will find settlement_batch_id IS NOT NULL and skip them
  --   until this batch is resolved or manually cleared.
  -- ----------------------------------------------------------
  IF v_final_status IN ('settled', 'partial_failure') THEN
    UPDATE public.order_payments
    SET
      is_settled          = true,
      settled_at          = NOW(),
      batch_number        = v_batch.batch_id   -- keep legacy varchar column in sync
    WHERE
      settlement_batch_id = p_batch_uuid;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 9: For 'retry' status — reset settlement_batch_id on
  -- these payments so the next prepare() can re-tag them with
  -- the new batch.
  -- WHY: prepare() filters WHERE settlement_batch_id IS NULL.
  --      If we leave it set, a retry prepare() finds 0 payments.
  -- ----------------------------------------------------------
  IF v_final_status = 'retry' THEN
    UPDATE public.order_payments
    SET settlement_batch_id = NULL
    WHERE settlement_batch_id = p_batch_uuid;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 10: Return a structured result for the POS UI.
  -- ----------------------------------------------------------
  RETURN jsonb_build_object(
    'success',             v_final_status IN ('settled', 'partial_failure'),
    'status',              v_final_status,
    'return_code',         v_return_code,
    'batch_id',            v_batch.batch_id,
    'settled_acquirers',   v_settled_acquirers,
    'failed_acquirers',    v_failed_acquirers,
    'should_retry',        (v_final_status = 'retry'),
    'requires_support',    (v_final_status = 'partial_failure')
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_location_payment_device_secret(p_location_id uuid, p_device_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(device_id uuid, tpn text, decrypted_secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_device public.location_payment_devices%rowtype;
begin
  if p_device_id is not null then
    select *
    into v_device
    from public.location_payment_devices lpd
    where lpd.id = p_device_id
      and lpd.location_id = p_location_id
      and lpd.is_active = true
    limit 1;
  else
    select *
    into v_device
    from public.location_payment_devices lpd
    where lpd.location_id = p_location_id
      and lpd.is_active = true
      and lpd.use_for_online_ordering = true
    order by lpd.updated_at desc, lpd.created_at desc
    limit 1;
  end if;

  if v_device.id is null then
    return;
  end if;

  return query
  select
    v_device.id,
    v_device.tpn,
    ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.id = v_device.ftd_ecom_key_secret_id
  limit 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unsettled_summary_by_terminal(p_merchant_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(terminal_uuid uuid, terminal_name text, terminal_type text, castles_ip_address text, castles_port integer, is_active boolean, is_connected boolean, payment_count bigint, gross_amount numeric, tip_amount numeric, total_amount numeric, oldest_payment_date date, newest_payment_date date, day_span integer, has_stuck_batch boolean, stuck_batch_status text, stuck_batch_uuid uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pt.id                                       AS terminal_uuid,
    pt.terminal_name                            AS terminal_name,
    pt.terminal_type                            AS terminal_type,
    pt.castles_ip_address                       AS castles_ip_address,
    pt.castles_port                             AS castles_port,
    pt.is_active                                AS is_active,
    pt.is_connected                             AS is_connected,

    -- Payment aggregates for unsettled captured payments
    COUNT(op.id)                                AS payment_count,
    COALESCE(SUM(op.amount),      0)            AS gross_amount,
    COALESCE(SUM(op.tip_amount),  0)            AS tip_amount,
    COALESCE(SUM(op.total_amount),0)            AS total_amount,
    MIN(op.approved_at::date)                   AS oldest_payment_date,
    MAX(op.approved_at::date)                   AS newest_payment_date,

    -- day_span: how many days of transactions are unsettled
    -- A merchant who hasn't closed in 5 days shows day_span = 5.
    -- The EOD UI shows: "You have 5 days of unsettled transactions."
    COALESCE(
      (MAX(op.approved_at::date) - MIN(op.approved_at::date)) + 1,
      0
    )::integer                                  AS day_span,

    -- Detect stuck batches: failed/retry/terminal_unavailable
    -- that are blocking this terminal from settling.
    (EXISTS (
      SELECT 1 FROM public.settlement_batches sb
      WHERE sb.payment_terminal_id = pt.id
        AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
    ))                                          AS has_stuck_batch,

    -- Return the status of the stuck batch (for UI messaging)
    (SELECT sb.status FROM public.settlement_batches sb
     WHERE sb.payment_terminal_id = pt.id
       AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
     ORDER BY sb.opened_at DESC
     LIMIT 1)                                   AS stuck_batch_status,

    (SELECT sb.id FROM public.settlement_batches sb
     WHERE sb.payment_terminal_id = pt.id
       AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
     ORDER BY sb.opened_at DESC
     LIMIT 1)                                   AS stuck_batch_uuid

  FROM public.payment_terminals pt
  -- Left join: include terminals even if they have zero unsettled payments
  -- so the UI can show "all terminals are settled" cleanly.
  LEFT JOIN public.order_payments op ON
    op.terminal_id       = pt.id::text
    AND op.terminal_type = 'castles'
    AND op.is_settled    = false
    AND op.status        = 'captured'

  WHERE
    pt.merchant_id = p_merchant_id
    AND pt.terminal_type = 'castles'
    AND pt.is_active = true
    -- Optional location filter
    AND (p_location_id IS NULL OR pt.location_id = p_location_id)

  GROUP BY
    pt.id, pt.terminal_name, pt.terminal_type,
    pt.castles_ip_address, pt.castles_port,
    pt.is_active, pt.is_connected;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.list_location_payment_devices(p_location_id uuid)
 RETURNS TABLE(id uuid, merchant_id uuid, location_id uuid, provider text, device_label text, tpn text, whitelist_origins text[], whitelist_synced_at timestamp with time zone, last_synced_from_crm_at timestamp with time zone, is_active boolean, use_for_online_ordering boolean, created_at timestamp with time zone, updated_at timestamp with time zone, ftd_key_configured boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_merchant_id uuid;
  v_carrier_id uuid;
begin
  select l.merchant_id, m.carrier_id
  into v_merchant_id, v_carrier_id
  from public.locations l
  join public.merchants m on m.id = l.merchant_id
  where l.id = p_location_id;

  if v_merchant_id is null then
    raise exception 'Location % not found', p_location_id
      using errcode = '42501';
  end if;

  if not (
    public.is_dexapos_admin()
    or public.is_merchant_admin(v_merchant_id)
    or public.is_location_member(p_location_id)
    or v_carrier_id = public.get_my_carrier_id()
  ) then
    raise exception 'Unauthorized: no access to location %', p_location_id
      using errcode = '42501';
  end if;

  return query
  select
    lpd.id,
    lpd.merchant_id,
    lpd.location_id,
    lpd.provider,
    lpd.device_label,
    lpd.tpn,
    lpd.whitelist_origins,
    lpd.whitelist_synced_at,
    lpd.last_synced_from_crm_at,
    lpd.is_active,
    lpd.use_for_online_ordering,
    lpd.created_at,
    lpd.updated_at,
    true as ftd_key_configured
  from public.location_payment_devices lpd
  where lpd.location_id = p_location_id
  order by lpd.use_for_online_ordering desc, lpd.updated_at desc, lpd.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_castles_settlement(p_terminal_id uuid, p_merchant_id uuid, p_initiated_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_terminal          record;
  v_payment_count     integer;
  v_date_start        date;
  v_date_end          date;
  v_gross             numeric(10,2);
  v_tips              numeric(10,2);
  v_total             numeric(10,2);
  v_batch_seq         integer;
  v_batch_id          text;
  v_batch_uuid        uuid;
  v_pos_txn_id        text;
  v_next_pos_txn_int  integer;
BEGIN

  -- ----------------------------------------------------------
  -- STEP 1: Lock the terminal row with FOR UPDATE.
  -- WHY: Prevents two simultaneous EOD attempts on the same
  --      terminal (e.g., manager + owner both clicking settle).
  --      The second caller waits here until the first commits.
  -- ----------------------------------------------------------
  SELECT * INTO v_terminal
  FROM public.payment_terminals
  WHERE id = p_terminal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terminal not found: %', p_terminal_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 2: Tenant isolation check.
  -- WHY: This RPC runs as SECURITY DEFINER (bypasses RLS).
  --      We must manually verify the terminal belongs to the
  --      calling merchant. Prevents cross-merchant data access.
  -- ----------------------------------------------------------
  IF v_terminal.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %',
      p_terminal_id, p_merchant_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 3: Auto-reset stale 'pending' batches for this terminal.
  -- WHY: If the POS app crashed after calling prepare but BEFORE
  --      sending the TCP request to Castles, the batch is stuck
  --      in 'pending' forever — blocking all future settlements.
  --      We auto-reset anything stuck for >10 minutes.
  --      10 min threshold: generous enough for slow networks,
  --      strict enough to not block EOD indefinitely.
  -- ----------------------------------------------------------
  UPDATE public.settlement_batches
  SET
    status         = 'failed',
    failure_reason = 'Auto-reset: prepare was called but the Castles device was never contacted (app crash or timeout). Safe to retry.',
    updated_at     = NOW()
  WHERE
    payment_terminal_id = p_terminal_id
    AND status = 'pending'
    AND opened_at < (NOW() - INTERVAL '10 minutes');

  -- ----------------------------------------------------------
  -- STEP 4: Block if a settlement is ACTIVELY in progress.
  -- We only block on 'settling' (TCP call is currently in-flight).
  -- 'pending' was already reset above if stale.
  -- 'retry' and 'failed' are fine — user is explicitly retrying.
  -- ----------------------------------------------------------
  IF EXISTS (
    SELECT 1
    FROM public.settlement_batches
    WHERE payment_terminal_id = p_terminal_id
      AND status IN ('pending', 'settling')
  ) THEN
    RAISE EXCEPTION 'A settlement is already in progress for terminal %. Wait or check for a stuck batch.', p_terminal_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 5: Find all unsettled, captured payments for this terminal.
  --
  -- CRITICAL JOIN NOTE: order_payments.terminal_id is TEXT storing
  -- the payment_terminals.id UUID as a string. Confirmed from staging
  -- data. Do NOT join on serial_number (it is NULL on all terminals).
  --
  -- Only include status='captured': 'authorized' payments have NOT
  -- been captured yet and MUST NOT be settled (they're not in the
  -- Castles batch). 'authorized' → card was approved but capture
  -- hasn't run. Only 'captured' payments are in the Castles batch.
  --
  -- settlement_batch_id IS NULL: exclude payments already tagged
  -- to a previous batch (e.g., from a failed attempt that we kept
  -- tagged for audit purposes).
  -- ----------------------------------------------------------
  SELECT
    COUNT(*)                          AS pmt_count,
    MIN(op.approved_at::date)         AS earliest_date,
    MAX(op.approved_at::date)         AS latest_date,
    COALESCE(SUM(op.amount),     0)   AS gross_total,
    COALESCE(SUM(op.tip_amount), 0)   AS tip_total,
    COALESCE(SUM(op.total_amount),0)  AS grand_total
  INTO
    v_payment_count, v_date_start, v_date_end,
    v_gross, v_tips, v_total
  FROM public.order_payments op
  WHERE
    op.terminal_id         = p_terminal_id::text   -- UUID stored as text
    AND op.terminal_type   = 'castles'
    AND op.is_settled      = false
    AND op.status          = 'captured'
    AND op.settlement_batch_id IS NULL;            -- not already tagged

  IF v_payment_count = 0 THEN
    RAISE EXCEPTION 'No unsettled captured payments found for terminal %. All transactions may already be settled or none have been captured yet.', p_terminal_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 6: Generate deterministic, human-readable batch_id.
  -- FORMAT: DEXA-{first8 of terminal UUID}-{YYYYMMDD}-{seq}
  -- EXAMPLE: DEXA-A3A706CC-20240410-001
  --
  -- WHY DETERMINISTIC: If this RPC is called twice due to a
  -- network hiccup, the second call hits the "already in progress"
  -- guard (step 4). The batch_id itself doesn't need to be
  -- idempotent — the guard handles duplicates.
  --
  -- batch_seq: count of all batches ever created for this terminal
  -- + 1. Monotonically increasing, never resets.
  -- ----------------------------------------------------------
  SELECT COUNT(*) + 1
  INTO v_batch_seq
  FROM public.settlement_batches
  WHERE payment_terminal_id = p_terminal_id;

  v_batch_id := 'DEXA-'
    || UPPER(LEFT(REPLACE(p_terminal_id::text, '-', ''), 8))
    || '-'
    || TO_CHAR(NOW() AT TIME ZONE 'America/New_York', 'YYYYMMDD')
    || '-'
    || LPAD(v_batch_seq::text, 3, '0');

  -- ----------------------------------------------------------
  -- STEP 7: Generate next txnPosTxnId (rolling 000001–999999).
  --
  -- WHY THIS MATTERS: Castles rejects with E000000E ("repeated
  -- transaction ID") if we send the same txnPosTxnId twice.
  -- We increment the stored value atomically here (the terminal
  -- row is already locked via FOR UPDATE from Step 1).
  --
  -- WRAP: After 999999, rolls back to 000001. This is safe —
  -- in practice a terminal won't run 999999 settlements.
  -- ----------------------------------------------------------
  v_next_pos_txn_int := (
    (COALESCE(v_terminal.castles_last_pos_txn_id, '000000')::integer % 999999) + 1
  );
  v_pos_txn_id := LPAD(v_next_pos_txn_int::text, 6, '0');

  -- Persist the new counter on the terminal row.
  UPDATE public.payment_terminals
  SET
    castles_last_pos_txn_id = v_pos_txn_id,
    updated_at              = NOW()
  WHERE id = p_terminal_id;

  -- ----------------------------------------------------------
  -- STEP 8: Create the settlement batch record.
  --
  -- status = 'pending': the batch exists but the Castles device
  -- hasn't been contacted yet. The app must set it to 'settling'
  -- immediately before sending the TCP request.
  --
  -- business_date = CURRENT_DATE: the calendar day settlement
  -- was INITIATED (kept NOT NULL per existing constraint).
  -- business_date_start / _end: the actual trading day range.
  -- ----------------------------------------------------------
  INSERT INTO public.settlement_batches (
    batch_id,
    merchant_id,
    location_id,
    payment_terminal_id,
    terminal_id,              -- varchar legacy column — store UUID as text
    business_date,            -- NOT NULL: date settlement was initiated
    business_date_start,      -- earliest payment date in this batch
    business_date_end,        -- latest payment date in this batch
    transaction_count,
    gross_amount,
    tip_amount,
    net_deposit,
    status,
    castles_pos_txn_id,
    opened_at,
    created_at,
    updated_at
  )
  VALUES (
    v_batch_id,
    p_merchant_id,
    v_terminal.location_id,
    p_terminal_id,
    p_terminal_id::text,
    CURRENT_DATE AT TIME ZONE 'America/New_York',
    v_date_start,
    v_date_end,
    v_payment_count,
    v_gross,
    v_tips,
    v_total,   -- net_deposit = total (fees calculated post-settlement)
    'pending',
    v_pos_txn_id,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_batch_uuid;

  -- ----------------------------------------------------------
  -- STEP 9: Tag all qualifying payments with this batch UUID.
  -- WHY: Creates the audit trail linking each payment to a
  -- specific settlement attempt. If this batch fails, the
  -- payments remain tagged (for history) but their is_settled
  -- stays false so the next prepare() picks them up again
  -- (settlement_batch_id IS NULL check excludes already-tagged ones).
  -- ----------------------------------------------------------
  UPDATE public.order_payments
  SET
    settlement_batch_id = v_batch_uuid,
    updated_at          = NOW()  -- assumes updated_at exists; remove if not
  WHERE
    terminal_id            = p_terminal_id::text
    AND terminal_type      = 'castles'
    AND is_settled         = false
    AND status             = 'captured'
    AND settlement_batch_id IS NULL;

  -- ----------------------------------------------------------
  -- STEP 10: Return everything the POS app needs.
  -- The app uses castles_request directly as the JSON body
  -- for the Castles TCP socket call (section 3.5 of the docs).
  -- ----------------------------------------------------------
  RETURN jsonb_build_object(
    -- Internal tracking
    'batch_uuid',         v_batch_uuid,
    'batch_id',           v_batch_id,
    'payment_count',      v_payment_count,
    'gross_amount',       v_gross,
    'tip_amount',         v_tips,
    'total_amount',       v_total,
    'date_range', jsonb_build_object(
      'start', v_date_start,
      'end',   v_date_end
    ),
    -- Ready-to-send Castles TCP request body (section 3.5)
    -- App sends this JSON verbatim over TCP to the Castles device.
    'castles_request', jsonb_build_object(
      'txnPosTxnId', v_pos_txn_id,
      'txnType',     'settlement'
    )
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_location_payment_device(p_location_id uuid, p_tpn text, p_ftd_ecom_key text DEFAULT NULL::text, p_device_label text DEFAULT NULL::text, p_use_for_online_ordering boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_merchant_id uuid;
  v_carrier_id uuid;
  v_device_id uuid;
  v_existing_secret_id uuid;
  v_secret_id uuid;
  v_secret_name text;
  v_trimmed_tpn text := nullif(trim(p_tpn), '');
  v_trimmed_ftd_key text := nullif(trim(coalesce(p_ftd_ecom_key, '')), '');
begin
  select l.merchant_id, m.carrier_id
  into v_merchant_id, v_carrier_id
  from public.locations l
  join public.merchants m on m.id = l.merchant_id
  where l.id = p_location_id;

  if v_merchant_id is null then
    raise exception 'Location % not found', p_location_id
      using errcode = '42501';
  end if;

  if not (
    public.is_dexapos_admin()
    or public.is_merchant_admin(v_merchant_id)
    or v_carrier_id = public.get_my_carrier_id()
  ) then
    raise exception 'Unauthorized: no access to location %', p_location_id
      using errcode = '42501';
  end if;

  if v_trimmed_tpn is null then
    raise exception 'TPN is required' using errcode = '22023';
  end if;

  select lpd.id, lpd.ftd_ecom_key_secret_id
  into v_device_id, v_existing_secret_id
  from public.location_payment_devices lpd
  where lpd.location_id = p_location_id
    and lpd.tpn = v_trimmed_tpn
  limit 1;

  v_secret_name := format('dejavoo_ftd:%s:%s', p_location_id, v_trimmed_tpn);

  if v_existing_secret_id is not null then
    v_secret_id := v_existing_secret_id;
  else
    select id
    into v_secret_id
    from vault.secrets
    where name = v_secret_name
    limit 1;
  end if;

  if v_secret_id is null and v_trimmed_ftd_key is null then
    raise exception 'FTD Ecom/TOP key is required for a new online-ordering payment device'
      using errcode = '22023';
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      v_trimmed_ftd_key,
      v_secret_name,
      'Dejavoo FTD Ecom/TOP key for location ' || p_location_id
    );
  elsif v_trimmed_ftd_key is not null then
    perform vault.update_secret(v_secret_id, v_trimmed_ftd_key);
  end if;

  if p_use_for_online_ordering then
    update public.location_payment_devices
    set use_for_online_ordering = false
    where location_id = p_location_id
      and use_for_online_ordering = true
      and tpn <> v_trimmed_tpn;
  end if;

  insert into public.location_payment_devices (
    merchant_id,
    carrier_id,
    location_id,
    provider,
    device_label,
    tpn,
    ftd_ecom_key_secret_id,
    last_synced_from_crm_at,
    is_active,
    use_for_online_ordering
  )
  values (
    v_merchant_id,
    v_carrier_id,
    p_location_id,
    'dejavoo',
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_trimmed_tpn,
    v_secret_id,
    now(),
    true,
    p_use_for_online_ordering
  )
  on conflict (location_id, tpn) do update
    set ftd_ecom_key_secret_id = excluded.ftd_ecom_key_secret_id,
        device_label = excluded.device_label,
        last_synced_from_crm_at = now(),
        is_active = true,
        use_for_online_ordering = excluded.use_for_online_ordering,
        updated_at = now()
  returning id into v_device_id;

  if p_use_for_online_ordering then
    update public.online_store_config
    set ipospays_tpn = v_trimmed_tpn,
        updated_at = now()
    where location_id = p_location_id;
  end if;

  return v_device_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.broadcast_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE
  payload jsonb;
  order_data jsonb;
  order_items_data jsonb;
  order_payments_data jsonb;
  order_refund_items_data jsonb;
  reversals_data jsonb;
  payment_items_data jsonb;


  v_topic text;
  v_location_id uuid;
  v_station_name text;
BEGIN
  -- Get location_id (handle DELETE case)
  v_location_id := COALESCE(NEW.location_id, OLD.location_id);

  IF v_location_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build topic
  v_topic := 'location:' || v_location_id::text || ':orders';

  -- Build payload based on operation
  IF TG_OP = 'DELETE' THEN
    -- DELETE: Minimal payload (no need to fetch items)
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', jsonb_build_object(
          'id', OLD.id,
          'order_number', OLD.order_number,
          'location_id', OLD.location_id,
          'station_id', OLD.station_id
        )
      )
    );
  ELSE
    -- INSERT/UPDATE: Full payload with order_items and modifiers
    -- 1. FETCH STATION NAME ----------------------------------------
    -- We need to look up the name based on the station_id
    SELECT station_name INTO v_station_name
    FROM stations
    WHERE id = NEW.station_id;
    -----------------------------------------------------------------
    -- Fetch order items WITH their modifiers for this order
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        --TODO: Might need to fetch menu_item base price 
        -- THIS LOGIC does not work for the current modifiers calculation locally
        'id', oi.id,
        'menu_item_id', oi.menu_item_id,
        'item_name', oi.item_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'cash_price', oi.cash_price,
        'subtotal', oi.subtotal,
        'cash_subtotal', oi.cash_subtotal,
        'base_card_price', oi.base_card_price,
        'base_cash_price', oi.base_cash_price,
        'tax_amount', oi.tax_amount,
        'cash_tax_amount', oi.cash_tax_amount,
        'discount_amount', COALESCE(oi.discount_amount, 0),
        'item_status', oi.item_status,
        'kitchen_status', oi.kitchen_status,
        'paid_quantity', COALESCE(oi.paid_quantity, 0),
        'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
        'refunded_amount', COALESCE(oi.refunded_amount, 0),
        'course_number', oi.course_number,
        'seat_number', oi.seat_number,
        'is_voided', COALESCE(oi.is_voided, false),
        'is_open_item', COALESCE(oi.is_open_item, false),
        'open_item_name', oi.open_item_name,
        'open_item_price', oi.open_item_price,
        'special_instructions', oi.special_instructions,
        'category_name', oi.category_name,
        'category_id', oi.category_id,
        'prep_station', oi.prep_station,
        'rush', COALESCE(oi.rush, false),
        'is_prioritized', COALESCE(oi.is_prioritized, false),
        'fire_time', oi.fire_time::timestamptz,
        -- Phase 2.5: Include modifiers for this item
        'modifiers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'modifier_group_id', oim.modifier_group_id,
              'modifier_item_id', oim.modifier_item_id,
              'modifier_group_name', oim.modifier_group_name,
              'modifier_name', oim.modifier_name,
              'price_modifier', oim.price_modifier,
              'quantity', oim.quantity,
              'is_no', COALESCE(oim.is_no, false)
            )
          ), '[]'::jsonb)
          FROM order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        )
      )
      ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
    ), '[]'::jsonb) INTO order_items_data
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND COALESCE(oi.is_voided, false) = false;

     
    -- Fetch order payments for this order
    -- Split into two jsonb_build_object calls to stay under 100-arg limit
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', op.id,
        'order_id', op.order_id,
        'payment_method', op.payment_method,
        'amount', op.amount,
        'tip_amount', COALESCE(op.tip_amount, 0),
        'total_amount', op.total_amount,
        'status', op.status,
        'subtotal_portion', op.subtotal_portion,
        'tax_portion', op.tax_portion,
        'discount_portion', op.discount_portion,
        'amount_tendered', op.amount_tendered,
        'change_given', COALESCE(op.change_given, 0),
        'is_cash_priced', COALESCE(op.is_cash_priced, false),
        'original_amount', op.original_amount,
        'split_portion_index', op.split_portion_index,
        'split_count', op.split_count,
        'covers_items', COALESCE(op.covers_items, ARRAY[]::uuid[]),
        'card_type', op.card_type,
        'card_last_four', op.card_last_four,
        'transaction_id', op.transaction_id,
        'terminal_type', op.terminal_type,
        'is_voided', COALESCE(op.is_voided, false),
        'void_reason', op.void_reason,
        'refunded_amount', COALESCE(op.refunded_amount, 0),
        'refunded_at', op.refunded_at
      ) || jsonb_build_object(
        'captured_at', op.captured_at,
        'authorization_code', op.authorization_code,
        'auth_code', op.auth_code,
        'rrn', op.rrn,
        'batch_number', op.batch_number,
        'dejavoo_batch_number', op.dejavoo_batch_number,
        'dejavoo_invoice_number', op.dejavoo_invoice_number,
        'result_code', op.result_code,
        'entry_mode', op.processor_response->'dejavoo_transaction'->>'entryMode',
        'reference_number', op.reference_number,
        'reference_id', op.reference_number,
        'created_at', op.initiated_at,
        -- Return/refund tracking fields
        'is_returned', COALESCE(op.is_returned, false),
        'returned_at', op.returned_at,
        'returned_by', op.returned_by,
        'return_amount', COALESCE(op.return_amount, 0),
        'return_rrn', op.return_rrn,
        'return_auth_code', op.return_auth_code,
        'return_reference_id', op.return_reference_id,
        'return_number', op.return_number,
        'return_reason', op.return_reason
      )
    ), '[]'::jsonb) INTO order_payments_data
    FROM order_payments op
    WHERE op.order_id = NEW.id
      AND op.status IN ('captured', 'refunded', 'partially_refunded', 'void');
    -- Include refunded/voided payments for history display

    -- Fetch reversals for this order (via payment linkage)
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'original_payment_id', r.original_payment_id,
        'original_psp_reference', r.original_psp_reference,
        'reversal_reference_id', r.reversal_reference_id,
        'reversal_psp_reference', r.reversal_psp_reference,
        'merchant_id', r.merchant_id,
        'location_id', r.location_id,
        'reversal_type', r.reversal_type,
        'amount', r.amount,
        'reason_code', r.reason_code,
        'reason_description', r.reason_description,
        'status', r.status,
        'result_code', r.result_code,
        'response_message', r.response_message,
        'initiated_by', r.initiated_by,
        'approved_by', r.approved_by,
        'requested_at', r.requested_at,
        'processed_at', r.processed_at,
        'completed_at', r.completed_at,
        'failed_at', r.failed_at,
        'terminal_response', r.terminal_response,
        'emv_data', r.emv_data
      )
    ), '[]'::jsonb) INTO reversals_data
    FROM reversals r
    JOIN order_payments op ON op.id = r.original_payment_id
    WHERE op.order_id = NEW.id;

    -- Fetch refund line items for this order
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ori.id,
        'reversal_id', ori.reversal_id,
        'order_item_id', ori.order_item_id,
        'order_payment_item_id', ori.order_payment_item_id,
        'quantity_refunded', ori.quantity_refunded,
        'unit_price_refunded', ori.unit_price_refunded,
        'subtotal_refunded', ori.subtotal_refunded,
        'tax_refunded', ori.tax_refunded,
        'total_refunded', ori.total_refunded,
        'refund_reason', ori.refund_reason,
        'refund_reason_detail', ori.refund_reason_detail,
        'return_to_inventory', ori.return_to_inventory,
        'inventory_updated', ori.inventory_updated,
        'created_at', ori.created_at
      )
    ), '[]'::jsonb) INTO order_refund_items_data
    FROM order_refund_items ori
    JOIN order_items oi ON oi.id = ori.order_item_id
    WHERE oi.order_id = NEW.id;


    -- Fetch per-payment item coverage from junction table
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', opi.id,
        'order_payment_id', opi.order_payment_id,
        'order_item_id', opi.order_item_id,
        'quantity_paid', opi.quantity_paid,
        'unit_price_paid', opi.unit_price_paid,
        'subtotal_paid', opi.subtotal_paid,
        'tax_paid', opi.tax_paid
      )
    ), '[]'::jsonb) INTO payment_items_data
    FROM order_payment_items opi
    JOIN order_payments op ON op.id = opi.order_payment_id
    WHERE op.order_id = NEW.id;


    -- Build order_data in parts to avoid 100 argument limit
    -- Part 1: Identifiers and relationships
    order_data := jsonb_build_object(
      'id', NEW.id,
      'order_number', NEW.order_number,
      'display_number', NEW.display_number,
      'external_id', NEW.external_id,
      'merchant_id', NEW.merchant_id,
      'location_id', NEW.location_id,
      'customer_id', NEW.customer_id,
      'created_by_staff_id', NEW.created_by_staff_id,
      'created_by_user_id', NEW.created_by_user_id,
      'assigned_server_id', NEW.assigned_server_id,
      'station_id', NEW.station_id,
      'station_name', v_station_name,
      'order_type', NEW.order_type,
      'order_source', NEW.order_source,
      'delivery_platform', COALESCE(NEW.delivery_platform, NEW.metadata->>'delivery_company'),
      'split_payment_path', NEW.split_payment_path,
      'status', NEW.status,
      'table_number', NEW.table_number,
      'seat_number', NEW.seat_number,
      'check_status', NEW.check_status
    );

    -- Part 2: Financial totals
    order_data := order_data || jsonb_build_object(
      'subtotal', NEW.subtotal,
      'tax_amount', NEW.tax_amount,
      'tip_amount', NEW.tip_amount,
      'discount_amount', NEW.discount_amount,
      'service_charge', NEW.service_charge,
      'total_amount', NEW.total_amount,
      'card_subtotal', NEW.card_subtotal,
      'card_tax_amount', NEW.card_tax_amount,
      'card_total', NEW.card_total,
      'cash_subtotal', NEW.cash_subtotal,
      'cash_tax_amount', NEW.cash_tax_amount,
      'cash_total', NEW.cash_total,
      'cash_discount_applied', NEW.cash_discount_applied,
      'cash_discount_amount', NEW.cash_discount_amount
    );

    -- Part 3: Effective pricing and payment status
    order_data := order_data || jsonb_build_object(
      'effective_subtotal', NEW.effective_subtotal,
      'effective_tax_amount', NEW.effective_tax_amount,
      'effective_total', NEW.effective_total,
      'payment_pricing_mode', NEW.payment_pricing_mode,
      'payment_status', NEW.payment_status,
      'amount_paid', NEW.amount_paid,
      'amount_due', NEW.amount_due,
      'cash_amount_due', NEW.cash_amount_due
    );

    -- Part 4: Timestamps
    order_data := order_data || jsonb_build_object(
      'created_at', NEW.created_at,
      'updated_at', NEW.updated_at,
      'sent_to_kitchen_at', NEW.sent_to_kitchen_at,
      'started_preparing_at', NEW.started_preparing_at,
      'ready_at', NEW.ready_at,
      'completed_at', NEW.completed_at,
      'cancelled_at', NEW.cancelled_at,
      'voided_at', NEW.voided_at
    );

    -- Part 5: Void info, sync info, order items, and payments
    order_data := order_data || jsonb_build_object(
      'voided_by', NEW.voided_by,
      'void_reason', NEW.void_reason,
      'cancellation_reason', NEW.cancellation_reason,
      'sync_version', NEW.sync_version,
      'is_offline', NEW.is_offline,
      'order_items', order_items_data,
      'order_payments', order_payments_data,
      'reversals', reversals_data,
      'order_refund_items', order_refund_items_data,
      'payment_items', payment_items_data
    );

    -- Build final payload
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', order_data
      )
    );
  END IF;

  -- RAISE LOG 'Active Order %', payload; 
  RAISE LOG 'Broadcasting order for location %', v_topic;
  RAISE LOG 'Broadcasting order for location %', payload;

  -- Broadcast using Supabase Realtime
  PERFORM realtime.send(
    payload,
    TG_OP,
    v_topic,
    true
  );

  RETURN NULL;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;
  RETURN NULL;
END;$function$
;

CREATE OR REPLACE FUNCTION public.check_merchant_access(target_merchant_id uuid, required_permission text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    current_clerk_user_id TEXT;
    merchant_clerk_org_id TEXT;
    carrier_id_lookup UUID;
    user_role_code TEXT;
BEGIN
    -- 1. Get Current User
    current_clerk_user_id := get_my_claim('sub')::text; -- Or use your request_user_id() helper
    IF current_clerk_user_id IS NULL THEN RETURN FALSE; END IF;

    -- 2. DEXA HQ OVERRIDE (Manage Everything)
    -- Replace with your actual HQ Org ID check or is_dexa_admin() function
    IF is_dexapos_admin()
    THEN
        RETURN TRUE;
    END IF;

    -- 3. Get Merchant Context (Clerk Org ID & Carrier ID)
    SELECT clerk_org_id, carrier_id INTO merchant_clerk_org_id, carrier_id_lookup
    FROM merchants
    WHERE id = target_merchant_id;

    -- 4. CARRIER OVERRIDE (Manage their merchants)
    IF EXISTS (
        SELECT 1 FROM members m
        JOIN carriers c ON c.clerk_org_id = m.organization_id
        WHERE m.user_id = current_clerk_user_id
        AND c.id = carrier_id_lookup
        -- Optional: Check if carrier member has specific carrier permissions here
    ) THEN
        RETURN TRUE;
    END IF;

    -- 5. MERCHANT ACCESS CHECK
    -- Get the user's role within this specific merchant
    SELECT role INTO user_role_code
    FROM members
    WHERE user_id = current_clerk_user_id
    AND organization_id = merchant_clerk_org_id;

    IF user_role_code IS NULL THEN
        RETURN FALSE; -- Not a member of this merchant
    END IF;

    -- If no specific permission is required (Read-Only access), basic membership is enough
    IF required_permission IS NULL THEN
        RETURN TRUE;
    END IF;

    -- 6. PERMISSION CHECK (Dynamic)
    -- specific override for your requirement: Owner/Admin always allow
    IF user_role_code IN ('merchant.owner', 'merchant.admin') THEN
        RETURN TRUE;
    END IF;

    -- Check if the user's role maps to the required permission code
    RETURN EXISTS (
        SELECT 1 FROM role_permissions
        WHERE role_code = user_role_code
        AND permission_code = required_permission
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$BEGIN
    RETURN get_my_claim('sub')::TEXT;
END;$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_with_categories(p_menu_id uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', m.id,
        'merchant_id', m.merchant_id,
        'location_id', m.location_id,
        'name', m.name,
        'description', m.description,
        'is_active', m.is_active,
        'is_global', (m.location_id IS NULL),
        'is_location_owned', (m.location_id IS NOT NULL),
        'created_at', m.created_at,
        'updated_at', m.updated_at,

        -- Categories with items (Uber Eats / DoorDash style)
        'categories', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', mc.id,
                    'category_id', c.id,
                    'display_order', COALESCE(
                        lmco.display_order,
                        lco.display_order,
                        mc.display_order
                    ),
                    'is_active', COALESCE(
                        lmco.is_active,
                        lco.is_active,
                        mc.is_active,
                        true
                    ),

                    'category', json_build_object(
                        'id', c.id,
                        'name', COALESCE(lmco.custom_title, mc.custom_title, c.name),
                        'description', c.description,
                        'image', COALESCE(mc.custom_image, c.image),
                        'has_location_override', (lco.id IS NOT NULL),
                        'has_menu_category_override', (lmco.id IS NOT NULL),
                        'location_id', c.location_id
                    ),

                    -- Items in this category on this menu
                    'items', (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'id', ci.id,
                                'menu_item_id', mi.id,
                                'category_id', c.id,
                                'display_order', COALESCE(lcio.display_order, ci.display_order),
                                'is_featured', COALESCE(lcio.is_featured, ci.is_featured),

                                'menu_item', json_build_object(
                                    'id', mi.id,
                                    'name', mi.name,
                                    'description', mi.description,
                                    'image', mi.image,
                                    'allergens', mi.allergens,
                                    'meal_types', mi.meal_types,
                                    'card_bg_color', mi.card_bg_color,

                                    -- ============================================
                                    -- PRICE BREAKDOWN (All Levels)
                                    -- ============================================
                                    'price_levels', json_build_object(
                                        'level_1_base', mi.price,
                                        'level_2_location_item', lio.custom_price,
                                        'level_2_modifier', lio.price_modifier,
                                        'level_2_modifier_type', lio.price_modifier_type,
                                        'level_3_category', ci.custom_price,
                                        'level_4_location_category', lcio.custom_price,
                                        'level_5_location_menu', lmio.custom_price,
                                        'level_1_delivery', mi.delivery_price,
                                        'level_2_location_item_delivery', lio.custom_delivery_price,
                                        'level_3_category_delivery', ci.custom_delivery_price,
                                        'level_4_location_category_delivery', lcio.custom_delivery_price,
                                        'level_5_location_menu_delivery', lmio.custom_delivery_price
                                    ),

                                    -- ============================================
                                    -- EFFECTIVE PRICE (Full Cascade)
                                    -- L5 > L4 > L3 > L2 > L1
                                    -- ============================================
                                    'effective_price', CASE
                                        -- Location-owned menu: simplified cascade
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(
                                                ci.custom_price,
                                                mi.price
                                            )
                                        -- Global menu with location context
                                        ELSE COALESCE(
                                            lmio.custom_price,                    -- L5: Location + Menu
                                            lcio.custom_price,                    -- L4: Location + Category
                                            ci.custom_price,                      -- L3: Category
                                            -- L2 with modifier logic
                                            CASE
                                                WHEN lio.price_modifier_type = 'add'
                                                     AND lio.price_modifier IS NOT NULL
                                                THEN mi.price + lio.price_modifier
                                                WHEN lio.price_modifier_type = 'percent'
                                                     AND lio.price_modifier IS NOT NULL
                                                THEN mi.price * (1 + lio.price_modifier / 100)
                                                WHEN lio.custom_price IS NOT NULL
                                                THEN lio.custom_price
                                                ELSE NULL
                                            END,
                                            mi.price                              -- L1: Base
                                        )
                                    END,

                                    'effective_cash_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_cash_price, mi.cash_price)
                                        ELSE COALESCE(
                                            lmio.custom_cash_price,
                                            lcio.custom_cash_price,
                                            ci.custom_cash_price,
                                            lio.custom_cash_price,
                                            mi.cash_price
                                        )
                                    END,

                                    'effective_delivery_price', CASE
                                        WHEN m.location_id IS NOT NULL THEN
                                            COALESCE(ci.custom_delivery_price, mi.delivery_price)
                                        ELSE COALESCE(
                                            lmio.custom_delivery_price,
                                            lcio.custom_delivery_price,
                                            ci.custom_delivery_price,
                                            lio.custom_delivery_price,
                                            mi.delivery_price
                                        )
                                    END,

                                    -- ============================================
                                    -- AVAILABILITY (AND Logic through all levels)
                                    -- ============================================
                                    'effective_availability', (
                                        mi.availability = true                           -- L1
                                        AND COALESCE(lio.is_available, true) = true      -- L2
                                        AND COALESCE(ci.is_available, true) = true       -- L3
                                        AND COALESCE(lcio.is_available, true) = true     -- L4
                                        AND COALESCE(lmio.is_available, true) = true     -- L5
                                    ),

                                    -- Item badges (location-specific)
                                    -- is_new: stored per-branch in location_item_overrides
                                    'is_new', COALESCE(lio.is_new, false),
                                    'is_popular', (
                                    COALESCE(lio.is_popular, false)
                                    OR (
                                        p_location_id IS NOT NULL
                                        AND (
                                            SELECT COUNT(*) >= 10
                                            FROM order_items oi
                                            JOIN orders o ON o.id = oi.order_id
                                            WHERE oi.menu_item_id = mi.id
                                              AND o.location_id = p_location_id
                                              AND o.status = 'completed'
                                              AND o.completed_at > NOW() - INTERVAL '30 days'
                                              AND oi.is_voided = false
                                        )
                                    )
                                ),

                                    -- Price source indicator for UI
                                    'price_source', CASE
                                        WHEN lmio.custom_price IS NOT NULL THEN 'location_menu'
                                        WHEN lcio.custom_price IS NOT NULL THEN 'location_category'
                                        WHEN ci.custom_price IS NOT NULL THEN 'category'
                                        WHEN lio.custom_price IS NOT NULL OR lio.price_modifier IS NOT NULL
                                            THEN 'location_item'
                                        ELSE 'base'
                                    END,

                                    -- Override flags for UI
                                    'has_location_item_override', (lio.id IS NOT NULL),
                                    'has_category_override', (ci.custom_price IS NOT NULL),
                                    'has_location_category_override', (lcio.id IS NOT NULL),
                                    'has_location_menu_override', (lmio.id IS NOT NULL),

                                    -- Stock info
                                    'stock_tracking_mode', COALESCE(
                                        NULLIF(lio.stock_tracking_mode, 'use_default'),
                                        mi.stock_tracking_mode
                                    ),
                                    'current_stock', lio.current_stock,

                                    -- Modifiers (with location overrides)
                                    'modifier_groups', (
                                        SELECT COALESCE(json_agg(
                                            json_build_object(
                                                'id', mg.id,
                                                'name', mg.name,
                                                'min_selections', mg.min_selections,
                                                'max_selections', mg.max_selections,
                                                'is_required', mg.is_required,
                                                'is_active', COALESCE(lmgo.is_active, true),

                                                'items', (
                                                    SELECT COALESCE(json_agg(
                                                        json_build_object(
                                                            'id', mgi.id,
                                                            'name', mgi.name,
                                                            'price_modifier', COALESCE(
                                                                lmio_mod.price_modifier,
                                                                mgi.price_modifier
                                                            ),
                                                            'is_active', (
                                                                mgi.is_active = true
                                                                AND COALESCE(lmio_mod.is_active, true) = true
                                                            ),
                                                            'is_default', mgi.is_default,
                                                            'stock_tracking_mode', COALESCE(
                                                                lmio_mod.stock_tracking_mode,
                                                                'in_stock'
                                                            ),
                                                            'current_stock', lmio_mod.current_stock
                                                        ) ORDER BY mgi.display_order, mgi.name
                                                    ), '[]'::json)
                                                    FROM modifier_group_items mgi
                                                    LEFT JOIN location_modifier_item_overrides lmio_mod
                                                        ON lmio_mod.modifier_group_item_id = mgi.id
                                                        AND lmio_mod.location_id = p_location_id
                                                    WHERE mgi.modifier_group_id = mg.id
                                                )
                                            ) ORDER BY mg.display_order, mg.name
                                        ), '[]'::json)
                                        FROM menu_item_modifier_groups mimg
                                        JOIN modifier_groups mg ON mg.id = mimg.modifier_group_id
                                        LEFT JOIN location_modifier_group_overrides lmgo
                                            ON lmgo.modifier_group_id = mg.id
                                            AND lmgo.location_id = p_location_id
                                        WHERE mimg.menu_item_id = mi.id
                                    )
                                )
                            ) ORDER BY COALESCE(lcio.display_order, ci.display_order)
                        ), '[]'::json)
                        FROM category_items ci
                        JOIN menu_items mi ON mi.id = ci.menu_item_id
                        -- L2: Location item override
                        LEFT JOIN location_item_overrides lio
                            ON lio.menu_item_id = mi.id
                            AND lio.location_id = p_location_id
                        -- L4: Location + Category override
                        LEFT JOIN location_category_item_overrides lcio
                            ON lcio.menu_item_id = mi.id
                            AND lcio.category_id = c.id
                            AND lcio.location_id = p_location_id
                        -- L5: Location + Menu override
                        LEFT JOIN location_menu_item_overrides lmio
                            ON lmio.menu_item_id = mi.id
                            AND lmio.menu_id = m.id
                            AND lmio.category_id = c.id
                            AND lmio.location_id = p_location_id
                        WHERE ci.category_id = c.id
                        -- Removed: AND COALESCE(ci.is_available, true) = true
                        -- Sold-out items now pass through with effective_availability = false
                        -- so the storefront can render them grayed out with a "Sold Out" label.
                    )
                ) ORDER BY COALESCE(lmco.display_order, lco.display_order, mc.display_order)
            ), '[]'::json)
            FROM menu_categories mc
            JOIN categories c ON c.id = mc.category_id
            LEFT JOIN location_category_overrides lco
                ON lco.category_id = c.id
                AND lco.location_id = p_location_id
            LEFT JOIN location_menu_category_overrides lmco
                ON lmco.category_id = c.id
                AND lmco.menu_id = m.id
                AND lmco.location_id = p_location_id
            WHERE mc.menu_id = m.id
              AND COALESCE(lmco.is_active, lco.is_active, mc.is_active, true) = true
        ),

        -- Schedules
        'schedules', (
            SELECT COALESCE(json_agg(
                json_build_object(
                    'id', ms.id,
                    'schedule', json_build_object(
                        'id', s.id,
                        'name', s.name,
                        'description', s.description,
                        'is_active', s.is_active,
                        'time_slots', (
                            SELECT COALESCE(json_agg(
                                json_build_object(
                                    'id', sts.id,
                                    'day_of_week', sts.day_of_week,
                                    'start_time', sts.start_time,
                                    'end_time', sts.end_time
                                )
                            ), '[]'::json)
                            FROM schedule_time_slots sts
                            WHERE sts.schedule_id = s.id
                        )
                    )
                )
            ), '[]'::json)
            FROM menu_schedules ms
            JOIN schedules s ON s.id = ms.schedule_id
            WHERE ms.menu_id = m.id
        )
    )
    INTO result
    FROM menus m
    WHERE m.id = p_menu_id;

    RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pos_inventory_sync(p_location_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_merchant_id UUID;
    v_result      JSON;
BEGIN
    SELECT merchant_id INTO v_merchant_id
    FROM locations
    WHERE id = p_location_id;

    IF v_merchant_id IS NULL THEN
        RETURN json_build_object('error', 'Location not found');
    END IF;

    SELECT json_agg(row_to_json(t)) INTO v_result
    FROM (
        SELECT
            ii.id,
            ii.name,
            ii.sku,
            ii.unit_type,
            ii.stock_mode,
            ii.reorder_point,
            ii.reorder_quantity,
            ii.is_active,
            ii.updated_at,
            COALESCE(lis.stock_quantity, 0)              AS stock_quantity,
            -- Effective cost: location override → global (no per-row scalar function)
            COALESCE(lio.cost_per_unit, ii.cost_per_unit, 0) AS effective_cost,
            -- Effective reorder point: location override → global
            COALESCE(lio.reorder_point, ii.reorder_point)    AS effective_reorder_point
        FROM inventory_items ii
        LEFT JOIN location_inventory_stock lis
               ON lis.inventory_item_id = ii.id
              AND lis.location_id       = p_location_id
        LEFT JOIN location_inventory_overrides lio
               ON lio.inventory_item_id = ii.id
              AND lio.location_id       = p_location_id
        WHERE ii.merchant_id = v_merchant_id
          AND ii.is_active   = true
        ORDER BY ii.name
    ) t;

    RETURN COALESCE(v_result, '[]'::json);
END;
$function$
;

grant delete on table "public"."location_payment_devices" to "anon";

grant insert on table "public"."location_payment_devices" to "anon";

grant references on table "public"."location_payment_devices" to "anon";

grant select on table "public"."location_payment_devices" to "anon";

grant trigger on table "public"."location_payment_devices" to "anon";

grant truncate on table "public"."location_payment_devices" to "anon";

grant update on table "public"."location_payment_devices" to "anon";

grant delete on table "public"."location_payment_devices" to "authenticated";

grant insert on table "public"."location_payment_devices" to "authenticated";

grant references on table "public"."location_payment_devices" to "authenticated";

grant select on table "public"."location_payment_devices" to "authenticated";

grant trigger on table "public"."location_payment_devices" to "authenticated";

grant truncate on table "public"."location_payment_devices" to "authenticated";

grant update on table "public"."location_payment_devices" to "authenticated";

grant delete on table "public"."location_payment_devices" to "service_role";

grant insert on table "public"."location_payment_devices" to "service_role";

grant references on table "public"."location_payment_devices" to "service_role";

grant select on table "public"."location_payment_devices" to "service_role";

grant trigger on table "public"."location_payment_devices" to "service_role";

grant truncate on table "public"."location_payment_devices" to "service_role";

grant update on table "public"."location_payment_devices" to "service_role";

grant delete on table "public"."payment_credential_access_log" to "anon";

grant insert on table "public"."payment_credential_access_log" to "anon";

grant references on table "public"."payment_credential_access_log" to "anon";

grant select on table "public"."payment_credential_access_log" to "anon";

grant trigger on table "public"."payment_credential_access_log" to "anon";

grant truncate on table "public"."payment_credential_access_log" to "anon";

grant update on table "public"."payment_credential_access_log" to "anon";

grant delete on table "public"."payment_credential_access_log" to "authenticated";

grant insert on table "public"."payment_credential_access_log" to "authenticated";

grant references on table "public"."payment_credential_access_log" to "authenticated";

grant select on table "public"."payment_credential_access_log" to "authenticated";

grant trigger on table "public"."payment_credential_access_log" to "authenticated";

grant truncate on table "public"."payment_credential_access_log" to "authenticated";

grant update on table "public"."payment_credential_access_log" to "authenticated";

grant delete on table "public"."payment_credential_access_log" to "service_role";

grant insert on table "public"."payment_credential_access_log" to "service_role";

grant references on table "public"."payment_credential_access_log" to "service_role";

grant select on table "public"."payment_credential_access_log" to "service_role";

grant trigger on table "public"."payment_credential_access_log" to "service_role";

grant truncate on table "public"."payment_credential_access_log" to "service_role";

grant update on table "public"."payment_credential_access_log" to "service_role";


  create policy "grant all to merchant admins"
  on "public"."category_items"
  as permissive
  for all
  to public
using (public.is_merchant_admin(merchant_id))
with check (public.is_merchant_admin(merchant_id));



  create policy "device_assignments_select_combined"
  on "public"."device_assignments"
  as permissive
  for select
  to authenticated
using ((public.is_dexapos_admin() OR (EXISTS ( SELECT 1
   FROM public.device_inventory di
  WHERE ((di.id = device_assignments.device_id) AND (di.merchant_id IS NOT NULL) AND public.is_merchant_admin(di.merchant_id)))) OR (EXISTS ( SELECT 1
   FROM (public.device_inventory di
     JOIN public.merchants m ON ((m.id = di.merchant_id)))
  WHERE ((di.id = device_assignments.device_id) AND (m.carrier_id = public.get_my_carrier_id()))))));



  create policy "device_config_history_select_combined"
  on "public"."device_config_history"
  as permissive
  for select
  to authenticated
using ((public.is_dexapos_admin() OR (EXISTS ( SELECT 1
   FROM public.device_inventory di
  WHERE ((di.id = device_config_history.device_id) AND (di.merchant_id IS NOT NULL) AND public.is_merchant_admin(di.merchant_id)))) OR (EXISTS ( SELECT 1
   FROM (public.device_inventory di
     JOIN public.merchants m ON ((m.id = di.merchant_id)))
  WHERE ((di.id = device_config_history.device_id) AND (m.carrier_id = public.get_my_carrier_id()))))));



  create policy "device_inventory_select_combined"
  on "public"."device_inventory"
  as permissive
  for select
  to authenticated
using ((public.is_dexapos_admin() OR ((merchant_id IS NOT NULL) AND public.is_merchant_admin(merchant_id)) OR ((merchant_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.merchants m
  WHERE ((m.id = device_inventory.merchant_id) AND (m.carrier_id = public.get_my_carrier_id())))))));



  create policy "device_notes_select_combined"
  on "public"."device_notes"
  as permissive
  for select
  to authenticated
using ((public.is_dexapos_admin() OR (EXISTS ( SELECT 1
   FROM public.device_inventory di
  WHERE ((di.id = device_notes.device_id) AND (di.merchant_id IS NOT NULL) AND public.is_merchant_admin(di.merchant_id)))) OR (EXISTS ( SELECT 1
   FROM (public.device_inventory di
     JOIN public.merchants m ON ((m.id = di.merchant_id)))
  WHERE ((di.id = device_notes.device_id) AND (m.carrier_id = public.get_my_carrier_id()))))));



  create policy "location_payment_devices_insert"
  on "public"."location_payment_devices"
  as permissive
  for insert
  to authenticated
with check ((public.is_dexapos_admin() OR public.is_merchant_admin(merchant_id) OR (carrier_id = public.get_my_carrier_id())));



  create policy "location_payment_devices_select"
  on "public"."location_payment_devices"
  as permissive
  for select
  to authenticated
using ((public.is_dexapos_admin() OR public.is_merchant_admin(merchant_id) OR public.is_location_member(location_id) OR (carrier_id = public.get_my_carrier_id())));



  create policy "location_payment_devices_update"
  on "public"."location_payment_devices"
  as permissive
  for update
  to authenticated
using ((public.is_dexapos_admin() OR public.is_merchant_admin(merchant_id) OR (carrier_id = public.get_my_carrier_id())))
with check ((public.is_dexapos_admin() OR public.is_merchant_admin(merchant_id) OR (carrier_id = public.get_my_carrier_id())));



  create policy "mbp_hq_admin_delete"
  on "public"."merchant_billing_profiles"
  as permissive
  for delete
  to public
using (public.is_dexapos_admin());



  create policy "mbp_hq_admin_insert"
  on "public"."merchant_billing_profiles"
  as permissive
  for insert
  to public
with check (public.is_dexapos_admin());



  create policy "mbp_hq_admin_update"
  on "public"."merchant_billing_profiles"
  as permissive
  for update
  to public
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());



  create policy "mbp_merchant_owner_delete"
  on "public"."merchant_billing_profiles"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM (public.merchants mer
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((mer.id = merchant_billing_profiles.merchant_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))));



  create policy "mbp_merchant_owner_insert"
  on "public"."merchant_billing_profiles"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM (public.merchants mer
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((mer.id = merchant_billing_profiles.merchant_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))));



  create policy "mbp_merchant_owner_update"
  on "public"."merchant_billing_profiles"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM (public.merchants mer
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((mer.id = merchant_billing_profiles.merchant_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))))
with check ((EXISTS ( SELECT 1
   FROM (public.merchants mer
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((mer.id = merchant_billing_profiles.merchant_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))));



  create policy "mbp_select_access"
  on "public"."merchant_billing_profiles"
  as permissive
  for select
  to public
using ((public.is_dexapos_admin() OR (EXISTS ( SELECT 1
   FROM (public.merchants mer
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((mer.id = merchant_billing_profiles.merchant_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))) OR (EXISTS ( SELECT 1
   FROM (((public.merchants mer
     JOIN public.carriers c ON ((c.id = mer.carrier_id)))
     JOIN public.members cm ON ((cm.organization_id = c.clerk_org_id)))
     JOIN public.roles cr ON ((cr.code = cm.role)))
  WHERE ((mer.id = merchant_billing_profiles.merchant_id) AND (cm.user_id = public.current_user_id()) AND (cr.organization_type = 'carrier'::public.organization_type))))));



  create policy "grant all to auth users"
  on "public"."modifier_group_item_recipes"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "payment_credential_access_log_select"
  on "public"."payment_credential_access_log"
  as permissive
  for select
  to authenticated
using ((public.is_dexapos_admin() OR (EXISTS ( SELECT 1
   FROM public.location_payment_devices lpd
  WHERE ((lpd.id = payment_credential_access_log.device_id) AND (public.is_merchant_admin(lpd.merchant_id) OR public.is_location_member(lpd.location_id) OR (lpd.carrier_id = public.get_my_carrier_id())))))));



  create policy "Merchant Admins can manage staff_profiles"
  on "public"."staff_profiles"
  as permissive
  for all
  to public
using (public.is_merchant_admin(merchant_id))
with check (public.is_merchant_admin(merchant_id));



  create policy "support_tickets_admin_or_merchant_all"
  on "public"."support_tickets"
  as permissive
  for all
  to public
using (((EXISTS ( SELECT 1
   FROM (public.members mem
     JOIN public.organizations o ON ((o.id = mem.organization_id)))
  WHERE ((mem.user_id = (( SELECT auth.uid() AS uid))::text) AND (o.id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = current_setting('app.dexa_hq_org_id'::text, true))
         LIMIT 1))))) OR (merchant_id IN ( SELECT m.id
   FROM public.merchants m
  WHERE (m.clerk_org_id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = ((auth.jwt() -> 'org'::text) ->> 'id'::text))
         LIMIT 1))))))
with check (((EXISTS ( SELECT 1
   FROM (public.members mem
     JOIN public.organizations o ON ((o.id = mem.organization_id)))
  WHERE ((mem.user_id = (( SELECT auth.uid() AS uid))::text) AND (o.id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = current_setting('app.dexa_hq_org_id'::text, true))
         LIMIT 1))))) OR (merchant_id IN ( SELECT m.id
   FROM public.merchants m
  WHERE (m.clerk_org_id = ( SELECT organizations.id
           FROM public.organizations
          WHERE (organizations.id = ((auth.jwt() -> 'org'::text) ->> 'id'::text))
         LIMIT 1))))));



  create policy "Users can delete their own notes"
  on "public"."customer_notes"
  as permissive
  for delete
  to public
using (((merchant_id = ( SELECT auth.uid() AS uid)) AND (created_by = (( SELECT auth.uid() AS uid))::text)));



  create policy "Users can insert notes for customers in their merchant"
  on "public"."customer_notes"
  as permissive
  for insert
  to public
with check ((merchant_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can update their own notes"
  on "public"."customer_notes"
  as permissive
  for update
  to public
using (((merchant_id = ( SELECT auth.uid() AS uid)) AND (created_by = (( SELECT auth.uid() AS uid))::text)))
with check (((merchant_id = ( SELECT auth.uid() AS uid)) AND (created_by = (( SELECT auth.uid() AS uid))::text)));



  create policy "Users can view notes for customers in their merchant"
  on "public"."customer_notes"
  as permissive
  for select
  to public
using ((merchant_id = ( SELECT auth.uid() AS uid)));



  create policy "lbp_carrier_admin_read"
  on "public"."location_banking_profiles"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM ((((public.locations l
     JOIN public.merchants mer ON ((mer.id = l.merchant_id)))
     JOIN public.carriers c ON ((c.id = mer.carrier_id)))
     JOIN public.members cm ON ((cm.organization_id = c.clerk_org_id)))
     JOIN public.roles cr ON ((cr.code = cm.role)))
  WHERE ((l.id = location_banking_profiles.location_id) AND (cm.user_id = public.current_user_id()) AND (cr.organization_type = 'carrier'::public.organization_type)))));



  create policy "lbp_hq_admin_all"
  on "public"."location_banking_profiles"
  as permissive
  for all
  to authenticated
using (public.is_dexapos_admin())
with check (public.is_dexapos_admin());



  create policy "lbp_merchant_owner_rw"
  on "public"."location_banking_profiles"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM ((public.locations l
     JOIN public.merchants mer ON ((mer.id = l.merchant_id)))
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((l.id = location_banking_profiles.location_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))))
with check ((EXISTS ( SELECT 1
   FROM ((public.locations l
     JOIN public.merchants mer ON ((mer.id = l.merchant_id)))
     JOIN public.members mm ON ((mm.organization_id = mer.clerk_org_id)))
  WHERE ((l.id = location_banking_profiles.location_id) AND (mm.user_id = public.current_user_id()) AND (mm.role = 'merchant.owner'::text)))));



  create policy "Merchants can delete their own campaigns"
  on "public"."marketing_campaigns"
  as permissive
  for delete
  to public
using ((merchant_id = ( SELECT auth.uid() AS uid)));



  create policy "Merchants can insert their own campaigns"
  on "public"."marketing_campaigns"
  as permissive
  for insert
  to public
with check ((merchant_id = ( SELECT auth.uid() AS uid)));



  create policy "Merchants can update their own campaigns"
  on "public"."marketing_campaigns"
  as permissive
  for update
  to public
using ((merchant_id = ( SELECT auth.uid() AS uid)))
with check ((merchant_id = ( SELECT auth.uid() AS uid)));



  create policy "Merchants can view their own campaigns"
  on "public"."marketing_campaigns"
  as permissive
  for select
  to public
using ((merchant_id = ( SELECT auth.uid() AS uid)));



  create policy "Users can insert recipients for their campaigns"
  on "public"."marketing_recipients"
  as permissive
  for insert
  to public
with check ((campaign_id IN ( SELECT marketing_campaigns.id
   FROM public.marketing_campaigns
  WHERE (marketing_campaigns.merchant_id = ( SELECT auth.uid() AS uid)))));



  create policy "Users can update recipients for their campaigns"
  on "public"."marketing_recipients"
  as permissive
  for update
  to public
using ((campaign_id IN ( SELECT marketing_campaigns.id
   FROM public.marketing_campaigns
  WHERE (marketing_campaigns.merchant_id = ( SELECT auth.uid() AS uid)))));



  create policy "Users can view recipients for their campaigns"
  on "public"."marketing_recipients"
  as permissive
  for select
  to public
using ((campaign_id IN ( SELECT marketing_campaigns.id
   FROM public.marketing_campaigns
  WHERE (marketing_campaigns.merchant_id = ( SELECT auth.uid() AS uid)))));


CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.device_heartbeats FOR EACH ROW EXECUTE FUNCTION public.moddatetime('updated_at');

CREATE TRIGGER update_location_payment_devices_updated_at BEFORE UPDATE ON public.location_payment_devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


