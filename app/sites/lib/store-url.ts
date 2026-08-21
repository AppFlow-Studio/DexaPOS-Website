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
