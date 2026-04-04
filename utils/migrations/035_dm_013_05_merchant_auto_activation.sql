-- ============================================================================
-- Migration 035: DM-013-05 Merchant Auto-Activation on First Successful Payment
-- ============================================================================
-- Purpose:
-- - Automatically move merchants from created/onboarding -> active once the
--   first successful payment is processed.
-- - Set activated_at and onboarding_completed_at timestamps.
-- - Write an audit log entry for the automated status transition.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_activate_merchant_on_first_successful_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_status text;
BEGIN
  IF NEW.merchant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status::text, '') NOT IN ('captured', 'succeeded') THEN
    RETURN NEW;
  END IF;

  SELECT onboarding_status
  INTO v_previous_status
  FROM public.merchants
  WHERE id = NEW.merchant_id;

  IF v_previous_status IS NULL OR v_previous_status NOT IN ('created', 'onboarding') THEN
    RETURN NEW;
  END IF;

  UPDATE public.merchants
  SET
    onboarding_status = 'active',
    activated_at = COALESCE(activated_at, now()),
    onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
    updated_at = now()
  WHERE id = NEW.merchant_id
    AND onboarding_status IN ('created', 'onboarding');

  IF FOUND THEN
    INSERT INTO public.audit_logs (
      action,
      action_category,
      severity,
      status,
      actor_name,
      actor_role,
      resource_type,
      resource_id,
      merchant_id,
      changes,
      metadata
    )
    VALUES (
      'merchant.status_auto_activated',
      'merchant',
      'info',
      'success',
      'System',
      'system',
      'merchant',
      NEW.merchant_id::text,
      NEW.merchant_id,
      jsonb_build_object(
        'before', jsonb_build_object('onboarding_status', v_previous_status),
        'after', jsonb_build_object('onboarding_status', 'active')
      ),
      jsonb_build_object(
        'source', 'order_payments_trigger',
        'auto_activation', true,
        'payment_id', NEW.id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_auto_activate_merchant
  ON public.order_payments;

CREATE TRIGGER trg_order_payments_auto_activate_merchant
  AFTER INSERT OR UPDATE OF status
  ON public.order_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_activate_merchant_on_first_successful_payment();

COMMENT ON FUNCTION public.auto_activate_merchant_on_first_successful_payment()
IS 'Auto-activates merchant onboarding status on first successful payment and writes an audit entry.';
