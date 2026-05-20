WITH castles_backfill AS (
    SELECT
        id,
        processor_response->'castles_transaction'->>'batchNumber' AS jsonb_batch_no
    FROM public.order_payments
    WHERE terminal_type = 'castles'
      AND processor_response ? 'castles_transaction'
      AND (
          acquirer IS NULL
          OR (batch_number IS NULL
              AND (processor_response->'castles_transaction'->>'batchNumber') IS NOT NULL)
      )
)
UPDATE public.order_payments op
SET
    acquirer = COALESCE(op.acquirer, 'TSYS'),
    batch_number = COALESCE(op.batch_number, cb.jsonb_batch_no)
FROM castles_backfill cb
WHERE op.id = cb.id;

WITH dejavoo_backfill AS (
    SELECT
        id,
        processor_response->'dejavoo_transaction'->>'batchNumber' AS jsonb_batch_no
    FROM public.order_payments
    WHERE terminal_type = 'dejavoo'
      AND processor_response ? 'dejavoo_transaction'
      AND batch_number IS NULL
      AND (processor_response->'dejavoo_transaction'->>'batchNumber') IS NOT NULL
)
UPDATE public.order_payments op
SET batch_number = db.jsonb_batch_no
FROM dejavoo_backfill db
WHERE op.id = db.id;;
