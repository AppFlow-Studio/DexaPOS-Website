-- Test-data seed for the "TSYS Disputes" page (app/dashboard/payments/disputes).
-- Not a schema migration — run manually against your dev DB, then delete the
-- rows (or the whole file) once you're done testing the UI.
--
-- Strategy: reuses your merchant's most recent captured order_payments rows
-- as the "original payment" for each fake dispute (so card_last_four, order
-- link, etc. all render for real), rather than fabricating a fake payment.
--
-- Usage: set v_clerk_org_id below to your merchant's Clerk org id (the one
-- your dev session is scoped to), then run the whole block.

do $$
declare
  v_clerk_org_id text := '<REPLACE_WITH_CLERK_ORG_ID>';
  v_merchant_id uuid;
  v_location_id uuid;
  v_payment_1 record;
  v_payment_2 record;
  v_payment_3 record;
  v_payment_4 record;
begin
  select id into v_merchant_id from merchants where clerk_org_id = v_clerk_org_id;
  if v_merchant_id is null then
    raise exception 'No merchant found for clerk_org_id = %.', v_clerk_org_id;
  end if;

  select id into v_location_id from locations where merchant_id = v_merchant_id limit 1;
  if v_location_id is null then
    raise exception 'No locations row found for merchant_id = %.', v_merchant_id;
  end if;

  -- Grab 4 distinct recent card payments for this merchant to attach disputes to.
  -- Requires order_payments rows to already exist (real orders); if none exist,
  -- create a couple of test orders/payments first.
  select op.id, op.card_last_four into v_payment_1
  from order_payments op
  join orders o on o.id = op.order_id
  where o.merchant_id = v_merchant_id and op.status = 'captured'
  order by op.captured_at desc nulls last
  limit 1 offset 0;

  select op.id, op.card_last_four into v_payment_2
  from order_payments op
  join orders o on o.id = op.order_id
  where o.merchant_id = v_merchant_id and op.status = 'captured'
  order by op.captured_at desc nulls last
  limit 1 offset 1;

  select op.id, op.card_last_four into v_payment_3
  from order_payments op
  join orders o on o.id = op.order_id
  where o.merchant_id = v_merchant_id and op.status = 'captured'
  order by op.captured_at desc nulls last
  limit 1 offset 2;

  select op.id, op.card_last_four into v_payment_4
  from order_payments op
  join orders o on o.id = op.order_id
  where o.merchant_id = v_merchant_id and op.status = 'captured'
  order by op.captured_at desc nulls last
  limit 1 offset 3;

  if v_payment_1.id is null then
    raise exception 'No captured order_payments rows found for merchant_id = %. Seed a real order/payment first, or these disputes will show "Source unknown".', v_merchant_id;
  end if;

  -- Dispute 1: urgent — deadline in 3 days, notified, no defense docs yet.
  insert into chargebacks
    (original_payment_id, merchant_id, location_id, amount, reason_code, reason_description,
     card_network, status, defendable, defense_deadline, received_at)
  values
    (v_payment_1.id, v_merchant_id, v_location_id, 84.50, '4853', 'Cardholder disputes quality of goods or services',
     'visa', 'notified', true, now() + interval '3 days', now() - interval '4 days');

  -- Dispute 2: under review, defense deadline further out, one doc uploaded.
  insert into chargebacks
    (original_payment_id, merchant_id, location_id, amount, reason_code, reason_description,
     card_network, status, defendable, defense_deadline, defense_documents, received_at)
  values
    (coalesce(v_payment_2.id, v_payment_1.id), v_merchant_id, v_location_id, 132.00, '10.4', 'Other fraud - card-absent environment',
     'mastercard', 'under_review', true, now() + interval '14 days',
     '[{"name": "receipt.pdf", "url": "https://example.com/receipt.pdf", "uploaded_at": "2026-08-14T10:00:00Z"}]'::jsonb,
     now() - interval '9 days');

  -- Dispute 3: overdue — deadline already passed, still notified (exercises the Overdue badge).
  insert into chargebacks
    (original_payment_id, merchant_id, location_id, amount, reason_code, reason_description,
     card_network, status, defendable, defense_deadline, received_at)
  values
    (coalesce(v_payment_3.id, v_payment_1.id), v_merchant_id, v_location_id, 45.25, '13.1', 'Merchandise/services not received',
     'visa', 'notified', true, now() - interval '2 days', now() - interval '20 days');

  -- Dispute 4: resolved (won) with a defense already submitted.
  insert into chargebacks
    (original_payment_id, merchant_id, location_id, amount, reason_code, reason_description,
     card_network, status, defendable, defense_deadline, defense_submitted_at, defense_documents,
     resolved_at, resolution, resolution_amount, received_at)
  values
    (coalesce(v_payment_4.id, v_payment_1.id), v_merchant_id, v_location_id, 220.00, '4863', 'Cardholder does not recognize transaction',
     'amex', 'won', true, now() - interval '25 days', now() - interval '28 days',
     '[{"name": "signed_receipt.pdf", "url": "https://example.com/signed_receipt.pdf", "uploaded_at": "2026-07-19T10:00:00Z"}]'::jsonb,
     now() - interval '15 days', 'Ruled in merchant favor', 0, now() - interval '30 days');

  raise notice 'Seeded 4 chargebacks for merchant_id=%, location_id=%', v_merchant_id, v_location_id;
end $$;
