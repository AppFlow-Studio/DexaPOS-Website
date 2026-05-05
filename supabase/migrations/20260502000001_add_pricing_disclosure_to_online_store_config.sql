-- C10: Add pricing_disclosure_text to online_store_config.
-- Allows per-location disclosure copy on the checkout order summary.
-- Defaults to a generic delivery pricing notice; Awdi can update per-location
-- as state-specific legal requirements are known.

ALTER TABLE public.online_store_config
  ADD COLUMN IF NOT EXISTS pricing_disclosure_text text
    DEFAULT 'Prices reflect online delivery rates and may differ from in-store pricing.';
