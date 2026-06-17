-- Per-item "TO GO" flag on invoice custom/line items.
-- Stored + displayed attribute only (invoices do not route to the kitchen).
ALTER TABLE public.invoice_items ADD COLUMN IF NOT EXISTS is_to_go BOOLEAN DEFAULT false;
