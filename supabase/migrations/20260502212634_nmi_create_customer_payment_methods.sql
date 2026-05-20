
CREATE TABLE public.customer_payment_methods (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id                 uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  customer_id                 uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  payment_device_id           uuid NOT NULL REFERENCES public.location_payment_devices(id) ON DELETE CASCADE,

  -- NMI Customer Vault references
  customer_vault_id           text NOT NULL,
  payment_method_token        text,

  -- Display-only (PCI-safe)
  card_brand                  text,
  card_last_four              text,
  card_exp_month              integer,
  card_exp_year               integer,
  cardholder_name             text,
  billing_address_line1       text,
  billing_postal_code         text,

  is_default                  boolean NOT NULL DEFAULT false,
  is_active                   boolean NOT NULL DEFAULT true,
  last_used_at                timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cpm_exp_month_chk CHECK (card_exp_month IS NULL OR card_exp_month BETWEEN 1 AND 12),
  CONSTRAINT cpm_exp_year_chk  CHECK (card_exp_year IS NULL OR card_exp_year >= 2024)
);

CREATE UNIQUE INDEX uq_cpm_default_per_customer
  ON public.customer_payment_methods(customer_id)
  WHERE is_default = true AND is_active = true;

CREATE INDEX idx_cpm_customer ON public.customer_payment_methods(customer_id);
CREATE INDEX idx_cpm_merchant ON public.customer_payment_methods(merchant_id);
CREATE INDEX idx_cpm_vault    ON public.customer_payment_methods(customer_vault_id);

ALTER TABLE public.customer_payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY hq_admin_full_access_cpm
  ON public.customer_payment_methods FOR ALL
  USING (is_dexapos_admin())
  WITH CHECK (is_dexapos_admin());

CREATE POLICY merchant_access_cpm
  ON public.customer_payment_methods FOR ALL
  USING (is_merchant_admin(merchant_id))
  WITH CHECK (is_merchant_admin(merchant_id));
;
