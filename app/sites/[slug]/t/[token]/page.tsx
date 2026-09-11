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
import { QrUnavailableState } from "../../../components/QrUnavailableState";
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

function buildQrUnavailableCopy({
  message,
  reason,
  nextOpen,
}: {
  message: string;
  reason?: string | null;
  nextOpen?: string | null;
}) {
  if (reason === "rate_limit_exceeded") {
    return {
      title: "Please wait before scanning again",
      message:
        "This table code was scanned too many times in a short window. Wait a moment, then scan the QR card again.",
      hint: "If this keeps happening, ask the staff for help at the table.",
      nextOpen: null,
    };
  }

  if (nextOpen || message.toLowerCase().includes("closed")) {
    return {
      title: "This store is currently closed",
      message:
        "QR ordering is not accepting new table orders right now. You can still return to the storefront and check the menu.",
      hint: "Ask the staff if table ordering should already be available for this shift.",
      nextOpen,
    };
  }

  if (message === "Invalid or inactive QR code") {
    return {
      title: "This QR code is no longer active",
      message:
        "The code on this table is expired, rotated, or no longer assigned. Ask the staff for a fresh table QR card.",
      hint: "A newly generated QR code from the dashboard should work immediately after deployment.",
      nextOpen: null,
    };
  }

  if (message === "QR ordering is unavailable for this store") {
    return {
      title: "QR ordering is not available here",
      message:
        "This storefront is live, but table ordering is currently disabled for this location.",
      hint: "Staff can still use the regular storefront until QR ordering is re-enabled.",
      nextOpen: null,
    };
  }

  return {
    title: "QR ordering is unavailable for this table",
    message,
    hint: "Ask the staff to confirm that this table QR code is active and assigned to the correct store.",
    nextOpen,
  };
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

function TableQrUnavailable({
  slug,
  storeName,
  message,
  reason,
  nextOpen,
}: {
  slug: string;
  storeName: string;
  message: string;
  reason?: string | null;
  nextOpen?: string | null;
}) {
  return (
    <QrUnavailableState
      slug={slug}
      storeName={storeName}
      eyebrow="QR Table Ordering"
      copy={buildQrUnavailableCopy({ message, reason, nextOpen })}
    />
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
      <TableQrUnavailable
        slug={slug}
        storeName={site?.title || location.name}
        message={resolvedSession.error || "QR ordering is unavailable for this table."}
        reason={resolvedSession.reason}
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
