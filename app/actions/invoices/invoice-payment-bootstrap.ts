"use server";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

// =============================================================================
// getInvoicePaymentBootstrap() — resolves the public-facing payment config the
// /invoice/<token> pay panel needs to render NMI Collect.js card fields.
//
// Best-effort, anonymous-safe (service-role): the payer has no session, so trust
// comes from the unguessable public token, and only the *public* tokenization
// key is ever returned — never secrets. Returns { tokenizationKey: null } when
// the merchant has no active NMI device, so the card form degrades gracefully to
// its "not configured" notice instead of erroring.
//
// §8 SEAM (Ali Dika): if the production Collect.js key must come from a different
// source than `location_payment_devices.provider_public_key` (e.g. the storefront
// `process-online-payment` edge function), override the resolution below. The
// PayPanel contract (a `tokenizationKey: string | null`) does not change.
// =============================================================================

export interface InvoicePaymentBootstrap {
  tokenizationKey: string | null;
}

export async function getInvoicePaymentBootstrap(
  publicToken: string,
): Promise<InvoicePaymentBootstrap> {
  if (!publicToken) return { tokenizationKey: null };

  const supabase = createServiceRoleClient();

  // Resolve the invoice's location from its token (never the UUID).
  const { data: invoice } = await supabase
    .from("invoices")
    .select("location_id")
    .eq("public_token", publicToken)
    .maybeSingle();

  const locationId = (invoice as { location_id: string | null } | null)?.location_id;
  if (!locationId) return { tokenizationKey: null };

  // Active NMI device for this location → its public tokenization key.
  const { data: device } = await supabase
    .from("location_payment_devices")
    .select("provider_public_key")
    .eq("location_id", locationId)
    .eq("provider", "nmi")
    .eq("is_active", true)
    .eq("use_for_online_ordering", true)
    .maybeSingle();

  const key = (device as { provider_public_key: string | null } | null)
    ?.provider_public_key;

  return { tokenizationKey: key ?? null };
}
