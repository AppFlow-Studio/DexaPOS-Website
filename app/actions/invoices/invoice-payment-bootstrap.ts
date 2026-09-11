"use server";

import { resolveInvoicePaymentRailForPublicToken } from "@/lib/invoices/payment-rail";
import { resolveValorEndpoints } from "@/lib/payments/valor/config";
import { getClientToken } from "@/lib/payments/valor/saleApi";
import type { ProcessorName } from "@/lib/payments/types";

// =============================================================================
// getInvoicePaymentBootstrap() resolves the public-facing payment config the
// /invoice/<token> pay panel needs to render the selected processor's fields.
//
// Best-effort, anonymous-safe (service-role): the payer has no session, so trust
// comes from the unguessable public token, and only browser-safe bootstrap data
// is ever returned; processor secrets stay server-side.
// =============================================================================

export interface InvoicePaymentBootstrap {
  provider: ProcessorName | null;
  tokenizationKey: string | null;
  valorClientToken: string | null;
  valorEpi: string | null;
  valorIsDemo: boolean;
}

const unavailableBootstrap: InvoicePaymentBootstrap = {
  provider: null,
  tokenizationKey: null,
  valorClientToken: null,
  valorEpi: null,
  valorIsDemo: false,
};

export async function getInvoicePaymentBootstrap(
  publicToken: string,
): Promise<InvoicePaymentBootstrap> {
  if (!publicToken) return unavailableBootstrap;

  const rail = await resolveInvoicePaymentRailForPublicToken(publicToken, {
    includeSecrets: true,
  });

  if (!rail) return unavailableBootstrap;

  if (rail.provider === "valor") {
    if (!rail.valorCredentials) {
      return { ...unavailableBootstrap, provider: "valor" };
    }

    try {
      const token = await getClientToken({
        credentials: rail.valorCredentials,
      });

      return {
        provider: "valor",
        tokenizationKey: null,
        valorClientToken: token.clientToken,
        valorEpi: rail.valorCredentials.epi,
        valorIsDemo: resolveValorEndpoints().isDemo,
      };
    } catch (error) {
      console.error(
        "[getInvoicePaymentBootstrap] Valor client-token error:",
        error,
      );
      return { ...unavailableBootstrap, provider: "valor" };
    }
  }

  return {
    ...unavailableBootstrap,
    provider: "nmi",
    tokenizationKey: rail.tokenizationKey,
  };
}
