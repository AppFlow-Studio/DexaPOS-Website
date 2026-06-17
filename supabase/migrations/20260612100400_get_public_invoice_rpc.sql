-- get_public_invoice(p_token) — display-only invoice payload for the public
-- /invoice/<token> page. Clone of get_public_receipt: SECURITY DEFINER, pinned
-- search_path, granted to anon + authenticated. Never exposes internal ids
-- beyond what the page renders.
--
-- Side effect: stamps viewed_at = now() and flips status sent→viewed on the
-- FIRST open only (viewed_at currently NULL and status = 'sent'). Idempotent on
-- subsequent opens.

CREATE OR REPLACE FUNCTION public.get_public_invoice(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_invoice_id uuid;
  v_result     jsonb;
BEGIN
  SELECT id INTO v_invoice_id
    FROM public.invoices
  WHERE public_token = p_token;

  IF v_invoice_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- First-open stamp: only when not yet viewed and currently 'sent'.
  UPDATE public.invoices
    SET viewed_at = now(),
        status    = 'viewed',
        updated_at = now()
  WHERE id = v_invoice_id
    AND viewed_at IS NULL
    AND status = 'sent';

  SELECT jsonb_build_object(
    'invoice', jsonb_build_object(
      'invoice_number',   inv.invoice_number,
      'status',           inv.status,
      'bill_type',        inv.bill_type,
      'payment_due_type', inv.payment_due_type,
      'due_date',         inv.due_date,
      'subtotal',         inv.subtotal,
      'discount_amount',  inv.discount_amount,
      'tax_rate',         inv.tax_rate,
      'tax_amount',       inv.tax_amount,
      'total_amount',     inv.total_amount,
      'amount_paid',      inv.amount_paid,
      'note',             inv.note,
      'created_at',       inv.created_at,
      'sent_at',          inv.sent_at,
      'paid_at',          inv.paid_at
    ),
    'merchant', jsonb_build_object(
      'name', COALESCE(m.dba_name, m.name)
    ),
    'location', CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name',          l.name,
      'address_line1', l.address_line1,
      'address_line2', l.address_line2,
      'city',          l.city,
      'state',         l.state,
      'postal_code',   l.postal_code,
      'phone',         l.phone
    ) END,
    'customer', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name',  c.name,
      'email', c.email,
      'phone', c.phone
    ) END,
    'logo_url', org."imageURL",
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',          ii.id,
          'name',        ii.name,
          'description', ii.description,
          'quantity',    ii.quantity,
          'unit_price',  ii.unit_price,
          'total_price', ii.total_price
        )
        ORDER BY ii.sort_order, ii.created_at
      )
      FROM public.invoice_items ii
    WHERE ii.invoice_id = v_invoice_id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.invoices inv
  JOIN public.merchants m        ON m.id = inv.merchant_id
  LEFT JOIN public.locations l   ON l.id = inv.location_id
  LEFT JOIN public.customers c   ON c.id = inv.customer_id
  LEFT JOIN public.organizations org ON org.id = m.clerk_org_id
  WHERE inv.id = v_invoice_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_invoice(text) TO anon, authenticated;
