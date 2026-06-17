"use server";

import { resolveInvoicePaymentRailForPublicToken } from "@/lib/invoices/payment-rail";

// =============================================================================
// getInvoicePaymentBootstrap() resolves the public-facing payment config the
// /invoice/<token> pay panel needs to render NMI Collect.js card fields.
//
// Best-effort, anonymous-safe (service-role): the payer has no session, so trust
// comes from the unguessable public token, and only the public tokenization key
// is ever returned � never secrets.
// =============================================================================

export interface InvoicePaymentBootstrap {
  tokenizationKey: string | null;
}

export async function getInvoicePaymentBootstrap(
  publicToken: string,
): Promise<InvoicePaymentBootstrap> {
  if (!publicToken) return { tokenizationKey: null };

  const rail = await resolveInvoicePaymentRailForPublicToken(publicToken, {
    includeSecrets: false,
  });

  return { tokenizationKey: rail?.tokenizationKey ?? null };
}
