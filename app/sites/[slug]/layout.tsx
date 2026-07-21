import { cache } from "react";
import type { Metadata } from "next";
import { getStorefrontMetaData } from "../actions";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

// Metadata only needs site (favicon) — use the meta-only fetcher (no menu tree).
// cache() dedupes repeated calls within a single request.
const getCachedStorefrontMeta = cache(getStorefrontMetaData);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { site } = await getCachedStorefrontMeta(slug);
  const faviconUrl = site?.theme_config?.faviconUrl;
  if (!faviconUrl) return {};
  return {
    icons: { icon: [{ url: faviconUrl, type: "image/png" }] },
  };
}

export default function SiteLayout({ children }: Props) {
  return <>{children}</>;
}
