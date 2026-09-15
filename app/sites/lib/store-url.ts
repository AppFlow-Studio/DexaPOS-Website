const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

export function buildStoreUrl(input: {
  slug?: string | null;
  customDomain?: string | null;
}): string {
  const customDomain = (input.customDomain || "").trim();
  if (customDomain) {
    if (/^https?:\/\//i.test(customDomain)) {
      return customDomain;
    }
    return `https://${customDomain}`;
  }

  const slug = (input.slug || "").trim();
  if (!slug) return "";

  if (ROOT_DOMAIN) {
    const isDev = ROOT_DOMAIN.includes("localhost");
    // Windows does not reliably resolve arbitrary `*.localhost` names. The
    // direct route is handled by the same storefront middleware and works on
    // every development machine without hosts-file entries.
    if (isDev) {
      const developmentOrigin = APP_URL || "http://localhost:3000";
      return `${normalizeBaseUrl(developmentOrigin)}/sites/${slug}`;
    }
    return `https://${slug}.${ROOT_DOMAIN}`;
  }

  if (APP_URL) {
    return `${normalizeBaseUrl(APP_URL)}/sites/${slug}`;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${normalizeBaseUrl(window.location.origin)}/sites/${slug}`;
  }

  return `http://${slug}.localhost:3000`;
}

/**
 * The URL printed on a flyer, decal or delivery bag.
 *
 * Short on purpose: the code is 10 Crockford base32 characters so the whole
 * address stays typable by someone who cannot get the camera to focus. Shares
 * `buildStoreUrl`'s custom-domain → root-domain → app-URL cascade, so a
 * merchant on their own domain gets their own domain on the flyer.
 */
export function buildMarketingQrUrl(input: {
  slug?: string | null;
  customDomain?: string | null;
  shortCode?: string | null;
}): string {
  const shortCode = (input.shortCode || "").trim();
  if (!shortCode) return "";

  const baseUrl = buildStoreUrl({
    slug: input.slug,
    customDomain: input.customDomain,
  });

  if (!baseUrl) return "";

  return `${baseUrl.replace(/\/+$/, "")}/m/${encodeURIComponent(shortCode)}`;
}

export function buildQrTableUrl(input: {
  slug?: string | null;
  customDomain?: string | null;
  token?: string | null;
}): string {
  const token = (input.token || "").trim();
  if (!token) return "";

  const baseUrl = buildStoreUrl({
    slug: input.slug,
    customDomain: input.customDomain,
  });

  if (!baseUrl) return "";

  return `${baseUrl.replace(/\/+$/, "")}/t/${encodeURIComponent(token)}`;
}
