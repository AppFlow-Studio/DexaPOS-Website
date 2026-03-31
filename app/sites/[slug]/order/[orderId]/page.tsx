import { getStorefrontData } from "../../../actions";
import { getOrderTracking, getStoreTaxRateByLocationId } from "../../../order-actions";
import { notFound } from "next/navigation";
import { TEMPLATE_DEFAULTS, buildThemeVars } from "../../../lib/theme-utils";
import { OrderTrackingPage } from "../../../components/OrderTrackingPage";
import { StorefrontRoot } from "../../../components/StorefrontRoot";

interface PageProps {
  params: Promise<{
    slug: string;
    orderId: string;
  }>;
}

export default async function OrderTrackingRoute({ params }: PageProps) {
  const { slug, orderId } = await params;
  const { site, location } = await getStorefrontData(slug);

  if (!location) {
    notFound();
  }

  // Fetch order first so we can use its location_id for the tax rate lookup.
  // This is more reliable than going through site.id since the order already
  // knows its location — no dependency on site being non-null.
  const { data: orderData } = await getOrderTracking(orderId);

  if (!orderData) {
    notFound();
  }

  // Fetch tax rate directly from the order's location — same query as cart/checkout.
  const taxRate = await getStoreTaxRateByLocationId(orderData.locationId);

  const theme = site?.theme_config;
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const themeStyle = buildThemeVars(theme);
  const bgColor = (themeStyle as Record<string, string>)["--bg"] ?? defaults.bg;
  const textColor = (themeStyle as Record<string, string>)["--text"] ?? defaults.text;
  const rootVarsCss = `:root { ${Object.entries(themeStyle).map(([k, v]) => `${k}: ${v}`).join("; ")} }`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rootVarsCss }} />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={defaults.fontUrl} />
      <StorefrontRoot
        themeStyle={themeStyle}
        templateId={templateId}
        baseBgColor={bgColor}
        baseTextColor={textColor}
        className="min-h-screen"
      >
        <OrderTrackingPage
          initialOrder={orderData}
          orderId={orderId}
          slug={slug}
          storeName={site?.title || location.name}
          logoUrl={site?.logo_url ?? undefined}
          storePhone={location.phone ?? undefined}
          taxRate={taxRate}
        />
      </StorefrontRoot>
    </>
  );
}
