import { getStorefrontData } from "../actions";
import { getStoreTaxRate } from "../order-actions";
import { notFound } from "next/navigation";
import { AnalyticsScripts } from "../components/AnalyticsScripts";
import { CartSidebar } from "../components/CartSidebar";
import { FloatingCartBar } from "../components/FloatingCartBar";
import { StorefrontLayout } from "../components/StorefrontLayout";
import { StorefrontRoot } from "../components/StorefrontRoot";
import { TEMPLATE_DEFAULTS, buildThemeVars, FONT_GOOGLE_URLS } from "../lib/theme-utils";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

function absoluteUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  return u.startsWith("http://") || u.startsWith("https://") ? u : null;
}

/**
 * Next.js generateMetadata: sets SEO metadata for this page.
 * The returned title and description are used for:
 * - Browser tab title (<title>)
 * - Meta description (<meta name="description">)
 * - Open Graph and Twitter cards when the link is shared
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-metadata
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { site, location } = await getStorefrontData(slug);
  if (!location) return { title: "Store" };
  const title =
    site?.meta_title?.trim() ||
    site?.title ||
    location.name ||
    "Order Online";
  const description =
    site?.meta_description?.trim() || site?.description || undefined;
  const ogImage =
    absoluteUrl(site?.og_image_url) ||
    absoluteUrl(site?.logo_url) ||
    absoluteUrl(site?.theme_config?.heroImageUrl ?? null);
  const canonicalPath = `/sites/${slug}`;
  return {
    title,
    description: description || undefined,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description: description || undefined,
      url: canonicalPath,
      siteName: site?.title || location.name || undefined,
      ...(ogImage && { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || undefined,
      ...(ogImage && { images: [ogImage] }),
    },
  };
}

const DAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const DAY_SCHEMA: Record<(typeof DAY_NAMES)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function buildOpeningHoursSpec(
  hours: Record<string, { enabled?: boolean; from?: string; to?: string; is24Hours?: boolean }> | undefined
): Array<{ "@type": string; dayOfWeek: string; opens: string; closes: string }> | undefined {
  if (!hours || typeof hours !== "object") return undefined;
  const out: Array<{ "@type": string; dayOfWeek: string; opens: string; closes: string }> = [];
  for (const day of DAY_NAMES) {
    const d = hours[day];
    if (!d?.enabled) continue;
    const opens = d.is24Hours ? "00:00" : (d.from ?? "09:00");
    const closes = d.is24Hours ? "23:59" : (d.to ?? "21:00");
    out.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_SCHEMA[day],
      opens,
      closes,
    });
  }
  return out.length ? out : undefined;
}

export default async function StorefrontPage({ params }: PageProps) {
  const { slug } = await params;
  const { site, location, menus } = await getStorefrontData(slug);

  if (!location) {
    notFound();
  }

  const taxRate = site?.id ? await getStoreTaxRate(site.id) : 0;

  const theme = site?.theme_config;
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const themeStyle = buildThemeVars(theme);
  const bgColor = (themeStyle as Record<string, string>)["--bg"] ?? defaults.bg;
  const textColor = (themeStyle as Record<string, string>)["--text"] ?? defaults.text;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || null;
  const storeUrl = baseUrl ? `${baseUrl}/sites/${slug}` : null;
  const openingHoursSpec = buildOpeningHoursSpec(
    site?.online_ordering_config?.operatingHours as Record<string, { enabled?: boolean; from?: string; to?: string; is24Hours?: boolean }> | undefined
  );
  const jsonLdRaw: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: site?.title || location.name,
    description: site?.meta_description?.trim() || site?.description || undefined,
    image: absoluteUrl(site?.og_image_url) || absoluteUrl(site?.logo_url) || undefined,
    url: storeUrl || undefined,
    telephone: location.phone || undefined,
    email: location.email || undefined,
    address: location.address_line1
      ? {
          "@type": "PostalAddress",
          streetAddress: location.address_line1,
          addressLocality: location.city,
          addressRegion: location.state,
          postalCode: location.postal_code,
        }
      : undefined,
    ...(openingHoursSpec?.length ? { openingHoursSpecification: openingHoursSpec } : {}),
  };
  const jsonLd = JSON.stringify(
    Object.fromEntries(
      Object.entries(jsonLdRaw).filter(([, v]) => v !== undefined && v !== null)
    )
  );

  // Inject theme CSS vars into :root so Sheet/Dialog portals (which render outside the themed div) inherit them.
  // Set font-family on :root and body so every element (including portals and unstyled Tailwind nodes) inherits
  // the merchant's chosen font without needing per-component overrides.
  const rootVarsCss = [
    `:root { ${Object.entries(themeStyle).map(([k, v]) => `${k}: ${v}`).join("; ")} }`,
    `:root, body { font-family: var(--font); }`,
  ].join("\n");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rootVarsCss }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={defaults.fontUrl} />
      {/* Custom body font chosen in dashboard — load if different from template default */}
      {theme?.fontFamily && FONT_GOOGLE_URLS[theme.fontFamily] && FONT_GOOGLE_URLS[theme.fontFamily] !== defaults.fontUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={FONT_GOOGLE_URLS[theme.fontFamily]} />
      )}
      <AnalyticsScripts
        googleAnalyticsId={site?.google_analytics_id}
        facebookPixelId={site?.facebook_pixel_id}
      />
      <StorefrontRoot
        themeStyle={themeStyle}
        templateId={templateId}
        baseBgColor={bgColor}
        baseTextColor={textColor}
      >
        <StorefrontLayout site={site} location={location} menus={menus} slug={slug} />
        <CartSidebar
          config={site?.online_ordering_config || undefined}
          storeConfigId={site?.id || ""}
          slug={slug}
          taxRate={taxRate}
          allItems={menus.flatMap((m) => m.categories?.flatMap((c) => c.items ?? []) ?? [])}
        />
        <FloatingCartBar
          freeDeliveryThreshold={site?.online_ordering_config?.freeDeliveryThreshold ?? null}
          baseDeliveryFee={site?.online_ordering_config?.baseDeliveryFee ?? null}
          prepTime={site?.online_ordering_config?.preparationLeadTime ?? null}
        />
      </StorefrontRoot>
    </>
  );
}
