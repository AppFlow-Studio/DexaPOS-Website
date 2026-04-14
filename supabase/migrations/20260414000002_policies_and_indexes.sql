-- =============================================================
-- Migration: sync prod policies and indexes from staging
-- Missing policies: 4  |  Missing indexes: 67
-- Extra in prod (not dropped — left as-is): 25
-- Policies wrapped in DO blocks — idempotent on duplicate_object
-- =============================================================

-- ── SECTION 1: Missing RLS policies ────────────────────────

DO $$ BEGIN
  CREATE POLICY "Merchant admins can delete categories " ON public.categories
    AS PERMISSIVE FOR DELETE TO public
    USING (is_merchant_admin(merchant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Merchant Admin can delete " ON public.menu_item_modifier_groups
    AS PERMISSIVE FOR UPDATE TO public
    USING (is_merchant_admin(merchant_id))
    WITH CHECK (is_merchant_admin(merchant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin Write" ON public.reservations
    AS PERMISSIVE FOR ALL TO public
    USING (is_merchant_admin(merchant_id))
    WITH CHECK (is_merchant_admin(merchant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Enable for merchant admins " ON public.schedules
    AS PERMISSIVE FOR DELETE TO public
    USING (is_merchant_admin(merchant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── SECTION 2: Missing indexes (67) ────────────────────────

-- cash_drawer_sessions
CREATE INDEX IF NOT EXISTS idx_cash_drawer_sessions_opened_by ON public.cash_drawer_sessions USING btree (opened_by);
-- cash_drawers
CREATE INDEX IF NOT EXISTS idx_cash_drawers_device_id ON public.cash_drawers USING btree (device_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawers_merchant_id ON public.cash_drawers USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS idx_cash_drawers_station_id ON public.cash_drawers USING btree (station_id);
-- customer_activities
CREATE INDEX IF NOT EXISTS idx_customer_activities_merchant_id ON public.customer_activities USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS idx_customer_activities_related_order_id ON public.customer_activities USING btree (related_order_id);
-- customer_feedback
CREATE INDEX IF NOT EXISTS idx_customer_feedback_location_id ON public.customer_feedback USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_responded_by ON public.customer_feedback USING btree (responded_by);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_server_staff_id ON public.customer_feedback USING btree (server_staff_id);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_session_id ON public.customer_feedback USING btree (session_id);
-- customer_notes
CREATE INDEX IF NOT EXISTS idx_customer_notes_created_by ON public.customer_notes USING btree (created_by);
-- customers
CREATE INDEX IF NOT EXISTS idx_customers_preferred_server_id ON public.customers USING btree (preferred_server_id);
CREATE INDEX IF NOT EXISTS idx_customers_referred_by_customer_id ON public.customers USING btree (referred_by_customer_id);
-- device_heartbeats
CREATE UNIQUE INDEX IF NOT EXISTS device_heartbeats_station_id_key ON public.device_heartbeats USING btree (station_id);
-- discounts
CREATE INDEX IF NOT EXISTS idx_discounts_end_date ON public.discounts USING btree (end_date) WHERE (end_date IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_discounts_merchant_location ON public.discounts USING btree (merchant_id, location_id);
-- kds_displays
CREATE INDEX IF NOT EXISTS idx_kds_displays_location_id ON public.kds_displays USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_kds_displays_merchant_id ON public.kds_displays USING btree (merchant_id);
-- kds_item_status
CREATE INDEX IF NOT EXISTS idx_kds_item_status_bumped_by ON public.kds_item_status USING btree (bumped_by);
CREATE INDEX IF NOT EXISTS idx_kds_item_status_order_item_id ON public.kds_item_status USING btree (order_item_id);
-- loyalty_programs
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_created_by ON public.loyalty_programs USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_punch_category_id ON public.loyalty_programs USING btree (punch_category_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_punch_menu_item_id ON public.loyalty_programs USING btree (punch_menu_item_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_reward_category_id ON public.loyalty_programs USING btree (reward_category_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_reward_menu_item_id ON public.loyalty_programs USING btree (reward_menu_item_id);
-- loyalty_rewards
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_merchant_id ON public.loyalty_rewards USING btree (merchant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_program_id ON public.loyalty_rewards USING btree (program_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_redeemed_location_id ON public.loyalty_rewards USING btree (redeemed_location_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_redeemed_order_id ON public.loyalty_rewards USING btree (redeemed_order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_reward_category_id ON public.loyalty_rewards USING btree (reward_category_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_reward_menu_item_id ON public.loyalty_rewards USING btree (reward_menu_item_id);
-- online_store_config
CREATE INDEX IF NOT EXISTS idx_online_store_config_setup_request_status ON public.online_store_config USING btree (setup_request_status);
-- order_courses
CREATE INDEX IF NOT EXISTS idx_order_courses_fired_by ON public.order_courses USING btree (fired_by);
-- order_discounts
CREATE INDEX IF NOT EXISTS idx_order_discounts_applied_by_staff_id ON public.order_discounts USING btree (applied_by_staff_profiles_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_approved_by_staff_id ON public.order_discounts USING btree (approved_by_staff_profiles_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_voided_by ON public.order_discounts USING btree (voided_by);
-- order_item_modifiers
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_modifier_group_id ON public.order_item_modifiers USING btree (modifier_group_id);
CREATE INDEX IF NOT EXISTS idx_order_item_modifiers_modifier_item_id ON public.order_item_modifiers USING btree (modifier_item_id);
-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_assigned_to_staff_id ON public.order_items USING btree (assigned_to_staff_id);
CREATE INDEX IF NOT EXISTS idx_order_items_discount_applied_by ON public.order_items USING btree (discount_applied_by);
CREATE INDEX IF NOT EXISTS idx_order_items_discount_approved_by ON public.order_items USING btree (discount_approved_by);
CREATE INDEX IF NOT EXISTS idx_order_items_discount_id ON public.order_items USING btree (discount_id);
CREATE INDEX IF NOT EXISTS idx_order_items_location_exclusive_item_id ON public.order_items USING btree (location_exclusive_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_selected_size_id ON public.order_items USING btree (selected_size_id);
CREATE INDEX IF NOT EXISTS idx_order_items_voided_by ON public.order_items USING btree (voided_by);
-- order_payments
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
-- order_refund_items
CREATE INDEX IF NOT EXISTS idx_order_refund_items_order_payment_item_id ON public.order_refund_items USING btree (order_payment_item_id);
-- order_status_history
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by_staff_id ON public.order_status_history USING btree (changed_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by_user_id ON public.order_status_history USING btree (changed_by_user_id);
-- orders
CREATE INDEX IF NOT EXISTS idx_orders_assigned_server_id ON public.orders USING btree (assigned_server_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_by_staff_id ON public.orders USING btree (created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_by_user_id ON public.orders USING btree (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_location_created_at_desc ON public.orders USING btree (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_location_id_status ON public.orders USING btree (location_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_station_id ON public.orders USING btree (station_id);
-- settlement_batches
CREATE INDEX IF NOT EXISTS idx_settlement_batches_terminal_status ON public.settlement_batches USING btree (payment_terminal_id, status) WHERE (payment_terminal_id IS NOT NULL);
-- tip_distribution_details
CREATE INDEX IF NOT EXISTS idx_tip_distribution_details_staff_name ON public.tip_distribution_details USING btree (staff_name);