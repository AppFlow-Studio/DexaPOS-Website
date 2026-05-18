
ALTER TABLE public.order_payments
  ADD COLUMN payment_device_id        uuid REFERENCES public.location_payment_devices(id),
  ADD COLUMN avs_response_code        text,
  ADD COLUMN cvv_response_code        text,
  ADD COLUMN processor_response_code  text,
  ADD COLUMN processor_response_text  text,
  ADD COLUMN customer_vault_id        text,
  ADD COLUMN idempotency_key          text;

CREATE INDEX idx_order_payments_device ON public.order_payments(payment_device_id);

CREATE UNIQUE INDEX uq_order_payments_idempotency
  ON public.order_payments(payment_device_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.sites
  ADD COLUMN payment_device_id uuid REFERENCES public.location_payment_devices(id);

CREATE INDEX idx_sites_payment_device ON public.sites(payment_device_id);
;
