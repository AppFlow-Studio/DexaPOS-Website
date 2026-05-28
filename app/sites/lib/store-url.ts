const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

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

  const isDev = ROOT_DOMAIN.includes("localhost");
  if (isDev) return `http://${slug}.localhost:3000`;
  return `https://${slug}.${ROOT_DOMAIN}`;
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
