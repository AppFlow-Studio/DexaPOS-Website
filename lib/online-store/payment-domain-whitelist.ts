import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildStoreUrl } from "@/app/sites/lib/store-url";

export interface PaymentDomainWhitelistSyncResult {
  success: boolean;
  origins: string[];
  paymentDeviceId?: string | null;
  provider?: string | null;
  domainWhitelisted: boolean;
  domainWhitelistSkipped: boolean;
  domainWhitelistError?: string;
  externalSyncPerformed?: boolean;
  externalSyncReason?: string | null;
}

function normalizeOrigin(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  try {
    const prefixed = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(prefixed);
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function buildStorefrontPaymentOrigins(input: {
  slug?: string | null;
  customDomain?: string | null;
}): string[] {
  const origins = new Set<string>();

  const defaultStoreOrigin = normalizeOrigin(
    buildStoreUrl({ slug: input.slug, customDomain: null }),
  );
  if (defaultStoreOrigin) {
    origins.add(defaultStoreOrigin);
  }

  const customDomainOrigin = normalizeOrigin(
    buildStoreUrl({ slug: null, customDomain: input.customDomain }),
  );
  if (customDomainOrigin) {
    origins.add(customDomainOrigin);
  }

  return Array.from(origins).sort();
}

export async function syncStorefrontPaymentDomainWhitelist(input: {
  locationId: string;
  slug?: string | null;
  customDomain?: string | null;
}): Promise<PaymentDomainWhitelistSyncResult> {
  const origins = buildStorefrontPaymentOrigins({
    slug: input.slug,
    customDomain: input.customDomain,
  });

  if (!input.locationId) {
    return {
      success: false,
      origins,
      domainWhitelisted: false,
      domainWhitelistSkipped: true,
      domainWhitelistError: "Missing location id for payment-domain sync.",
    };
  }

  if (origins.length === 0) {
    return {
      success: false,
      origins,
      domainWhitelisted: false,
      domainWhitelistSkipped: true,
      domainWhitelistError:
        "No storefront origins could be derived for payment-domain sync.",
    };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.functions.invoke(
    "storefront-payment-domain-whitelist",
    {
      body: {
        locationId: input.locationId,
        origins,
      },
    },
  );

  if (error) {
    return {
      success: false,
      origins,
      domainWhitelisted: false,
      domainWhitelistSkipped: false,
      domainWhitelistError: error.message,
    };
  }

  const result =
    (data as Partial<PaymentDomainWhitelistSyncResult> | null) ?? null;

  return {
    success: Boolean(result?.success),
    origins: Array.isArray(result?.origins) ? result.origins : origins,
    paymentDeviceId:
      typeof result?.paymentDeviceId === "string" ? result.paymentDeviceId : null,
    provider: typeof result?.provider === "string" ? result.provider : null,
    domainWhitelisted: Boolean(result?.domainWhitelisted),
    domainWhitelistSkipped: Boolean(result?.domainWhitelistSkipped),
    domainWhitelistError:
      typeof result?.domainWhitelistError === "string"
        ? result.domainWhitelistError
        : undefined,
    externalSyncPerformed: Boolean(result?.externalSyncPerformed),
    externalSyncReason:
      typeof result?.externalSyncReason === "string"
        ? result.externalSyncReason
        : null,
  };
}
