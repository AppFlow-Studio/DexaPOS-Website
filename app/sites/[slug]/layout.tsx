import { cache } from "react";
import type { Metadata } from "next";
import { getStorefrontData } from "../actions";

interface Props {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

// Deduplicate DB calls: layout + page both call this, cache() ensures one round-trip per request.
const getCachedStorefrontData = cache(getStorefrontData);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { site } = await getCachedStorefrontData(slug);
  const faviconUrl = site?.theme_config?.faviconUrl;
  if (!faviconUrl) return {};
  return {
    icons: { icon: [{ url: faviconUrl, type: "image/png" }] },
  };
}

export default function SiteLayout({ children }: Props) {
  return <>{children}</>;
}
