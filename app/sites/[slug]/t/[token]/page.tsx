import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStorefrontData } from "../../../actions";
import { getStoreTaxRate } from "../../../order-actions";
import { resolveQrStorefrontSession } from "../../../qr-actions";
import { AnalyticsScripts } from "../../../components/AnalyticsScripts";
import { CartSidebar } from "../../../components/CartSidebar";
import { FloatingCartBar } from "../../../components/FloatingCartBar";
import { StorefrontLayout } from "../../../components/StorefrontLayout";
import { StorefrontRoot } from "../../../components/StorefrontRoot";
import {
  TEMPLATE_DEFAULTS,
  buildThemeVars,
  FONT_GOOGLE_URLS,
} from "../../../lib/theme-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{
    slug: string;
    token: string;
  }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { site, location } = await getStorefrontData(slug);

  const title = site?.title || location?.name || "QR Table Ordering";

  return {
    title: `Table ordering · ${title}`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

function QrUnavailableState({
  slug,
  storeName,
  message,
  nextOpen,
}: {
  slug: string;
  storeName: string;
  message: string;
  nextOpen?: string | null;
}) {
  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6">
        <p
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#0C4FD1" }}
        >
          QR Table Ordering
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          {storeName}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>
        {nextOpen ? (
          <p className="mt-3 text-sm text-slate-600">
            Next open: <span className="font-medium text-slate-900">{nextOpen}</span>
          </p>
        ) : null}
        <div className="mt-6">
          <Link
            href={`/sites/${slug}`}
            className="inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: "#0C4FD1", color: "#FFFFFF" }}
          >
            Back to menu
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function QrStorefrontPage({ params }: PageProps) {
  const { slug, token } = await params;

  const [{ site, location, menus }, resolvedSession] =
    await Promise.all([
      getStorefrontData(slug),
      resolveQrStorefrontSession(slug, token),
    ]);

  if (!location) {
    notFound();
  }

  if (!resolvedSession.success || !resolvedSession.sessionToken) {
    return (
      <QrUnavailableState
        slug={slug}
        storeName={site?.title || location.name}
        message={resolvedSession.error || "QR ordering is unavailable for this table."}
        nextOpen={resolvedSession.nextOpen}
      />
    );
  }

  const taxRate = site?.id ? await getStoreTaxRate(site.id) : 0;

  const theme = site?.theme_config;
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const themeStyle = buildThemeVars(theme);
  const bgColor = (themeStyle as Record<string, string>)["--bg"] ?? defaults.bg;
  const textColor = (themeStyle as Record<string, string>)["--text"] ?? defaults.text;
  const rootVarsCss = `:root { ${Object.entries(themeStyle)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ")} }`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rootVarsCss }} />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={defaults.fontUrl} />
      {theme?.fontFamily &&
      FONT_GOOGLE_URLS[theme.fontFamily] &&
      FONT_GOOGLE_URLS[theme.fontFamily] !== defaults.fontUrl ? (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={FONT_GOOGLE_URLS[theme.fontFamily]} />
      ) : null}
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
        <StorefrontLayout
          site={site}
          location={location}
          menus={menus}
          slug={slug}
          seedQrSession={{
            sessionToken: resolvedSession.sessionToken,
            floorPlanObjectId: resolvedSession.floorPlanObjectId ?? null,
            tableLabel: resolvedSession.tableLabel ?? null,
            tableQrCodeId: resolvedSession.tableQrCodeId ?? null,
          }}
        />
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
