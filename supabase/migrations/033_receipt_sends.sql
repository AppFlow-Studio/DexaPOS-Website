-- DM-012-12: receipt_sends table for rate limiting and audit logging
CREATE TABLE public.receipt_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_method text NOT NULL CHECK (delivery_method IN ('email', 'sms')),
  recipient text NOT NULL,
  receipt_template_id uuid REFERENCES public.receipt_templates(id),
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message text,
  created_by text,
  CONSTRAINT receipt_sends_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_receipt_sends_order_id ON public.receipt_sends(order_id);
CREATE INDEX idx_receipt_sends_order_sent_at ON public.receipt_sends(order_id, sent_at);

COMMENT ON TABLE public.receipt_sends IS 'Audit log for digital receipt sends (email/SMS). Used for rate limiting (max 3 per order per hour).';
