  -- Public receipt tokens: two-segment opaque URL (t1 = per-order, t2 = per-send).
  -- No order UUID is ever exposed in receipt URLs.
  --
  -- Postgres does not allow ALTER TABLE in the same transaction as UPDATE on a
  -- table that has row-level triggers (pending trigger events error). Each step
  -- runs in its own transaction to avoid that.

  -- ─── Step 1: add nullable column (no triggers fire, safe in one txn) ─────────

  ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS receipt_token text;

  -- ─── Step 2: backfill existing rows ──────────────────────────────────────────
  -- Separate implicit transaction — no ALTER TABLE follows in this block.

  UPDATE public.orders
    SET receipt_token = replace(replace(replace(
          encode(gen_random_bytes(16), 'base64'),
          '+', '-'), '/', '_'), '=', '')
  WHERE receipt_token IS NULL;

  -- ─── Step 3: add NOT NULL + DEFAULT + unique index ────────────────────────────
  -- Fresh transaction — no DML on orders in this block.

  ALTER TABLE public.orders
    ALTER COLUMN receipt_token SET NOT NULL,
    ALTER COLUMN receipt_token SET DEFAULT
      replace(replace(replace(
        encode(gen_random_bytes(16), 'base64'),
        '+', '-'), '/', '_'), '=', '');

  CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_receipt_token
    ON public.orders (receipt_token);

  -- ─── Step 4: receipt_sends — send_token + widen status ───────────────────────

  BEGIN;

  ALTER TABLE public.receipt_sends
    ADD COLUMN IF NOT EXISTS send_token text
      DEFAULT replace(replace(replace(
        encode(gen_random_bytes(16), 'base64'),
        '+', '-'), '/', '_'), '=', '');

  UPDATE public.receipt_sends
    SET send_token = replace(replace(replace(
          encode(gen_random_bytes(16), 'base64'),
          '+', '-'), '/', '_'), '=', '')
  WHERE send_token IS NULL;

  ALTER TABLE public.receipt_sends
    ALTER COLUMN send_token SET NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_sends_send_token
    ON public.receipt_sends (send_token);

  ALTER TABLE public.receipt_sends
    DROP CONSTRAINT IF EXISTS receipt_sends_status_check;
  ALTER TABLE public.receipt_sends
    ADD CONSTRAINT receipt_sends_status_check
      CHECK (status IN ('pending', 'sent', 'failed'));

  COMMIT;

  -- ─── Step 5: trigger to auto-assign receipt_token on new orders ───────────────

  CREATE OR REPLACE FUNCTION public.set_order_receipt_token()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
  BEGIN
    IF NEW.receipt_token IS NULL THEN
      NEW.receipt_token := replace(replace(replace(
        encode(gen_random_bytes(16), 'base64'),
        '+', '-'), '/', '_'), '=', '');
    END IF;
    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_orders_set_receipt_token ON public.orders;
  CREATE TRIGGER trg_orders_set_receipt_token
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_receipt_token();

  -- ─── Step 6: get_public_receipt RPC ──────────────────────────────────────────

  CREATE OR REPLACE FUNCTION public.get_public_receipt(
    p_order_token  text,
    p_send_token   text DEFAULT NULL
  )
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $$
  DECLARE
    v_order_id  uuid;
    v_result    jsonb;
  BEGIN
    SELECT id INTO v_order_id
      FROM public.orders
    WHERE receipt_token = p_order_token;

    IF v_order_id IS NULL THEN
      RETURN NULL;
    END IF;

    IF p_send_token IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.receipt_sends
        WHERE order_id   = v_order_id
          AND send_token = p_send_token
      ) THEN
        RETURN NULL;
      END IF;
    END IF;

    SELECT jsonb_build_object(
      'order', jsonb_build_object(
        'display_number',       o.display_number,
        'order_number',         o.order_number,
        'created_at',           o.created_at,
        'status',               o.status,
        'payment_status',       o.payment_status,
        'voided_at',            o.voided_at,
        'void_reason',          o.void_reason,
        'subtotal',             o.subtotal,
        'tax_amount',           o.tax_amount,
        'tip_amount',           o.tip_amount,
        'discount_amount',      o.discount_amount,
        'service_charge',       o.service_charge,
        'total_amount',         o.total_amount,
        'effective_subtotal',   o.effective_subtotal,
        'effective_tax_amount', o.effective_tax_amount,
        'effective_total',      o.effective_total,
        'payment_pricing_mode', o.payment_pricing_mode,
        'cash_total',           o.cash_total,
        'card_total',           o.card_total
      ),
      'location', jsonb_build_object(
        'name',          l.name,
        'address_line1', l.address_line1,
        'address_line2', l.address_line2,
        'city',          l.city,
        'state',         l.state,
        'postal_code',   l.postal_code,
        'phone',         l.phone
      ),
      'logo_url', org."imageURL",
      'items', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',         oi.id,
            'item_name',  oi.item_name,
            'quantity',   oi.quantity,
            'unit_price', oi.unit_price,
            'subtotal',   oi.subtotal,
            'is_voided',  oi.is_voided,
            'modifiers',  COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'modifier_group_name', oim.modifier_group_name,
                  'modifier_name',       oim.modifier_name,
                  'price_modifier',      oim.price_modifier,
                  'quantity',            oim.quantity,
                  'is_no',               oim.is_no
                )
              )
              FROM public.order_item_modifiers oim
            WHERE oim.order_item_id = oi.id
            ), '[]'::jsonb)
          )
          ORDER BY oi.created_at
        )
        FROM public.order_items oi
      WHERE oi.order_id = v_order_id
      ), '[]'::jsonb),
      'payments', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'payment_method', op.payment_method,
            'amount',         op.amount,
            'tip_amount',     op.tip_amount,
            'total_amount',   op.total_amount,
            'status',         op.status,
            'card_type',      op.card_type,
            'card_last_four', op.card_last_four,
            'terminal_type',  op.terminal_type,
            'refunded_amount',op.refunded_amount,
            'refunded_at',    op.refunded_at
          )
          ORDER BY op.created_at
        )
        FROM public.order_payments op
      WHERE op.order_id = v_order_id
        AND op.status IN ('captured', 'paid', 'refunded', 'partially_refunded')
      ), '[]'::jsonb)
    )
    INTO v_result
    FROM public.orders o
    JOIN public.locations l   ON l.id = o.location_id
    JOIN public.merchants m   ON m.id = o.merchant_id
    LEFT JOIN public.organizations org ON org.id = m.clerk_org_id
    WHERE o.id = v_order_id;

    RETURN v_result;
  END;
  $$;

  REVOKE ALL ON FUNCTION public.get_public_receipt(text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_public_receipt(text, text) TO anon, authenticated;
