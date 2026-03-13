import { getStorefrontData } from "../../../actions";
import { getOrderTracking } from "../../../order-actions";
import { notFound } from "next/navigation";
import { TEMPLATE_DEFAULTS, buildThemeVars } from "../../../lib/theme-utils";
import { OrderTrackingPage } from "../../../components/OrderTrackingPage";

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

  const { data: orderData } = await getOrderTracking(orderId);

  if (!orderData) {
    notFound();
  }

  const theme = site?.theme_config;
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const themeStyle = buildThemeVars(theme);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={defaults.fontUrl} />
      <div
        className="min-h-screen"
        style={{
          ...themeStyle,
          backgroundColor: "var(--bg)",
          color: "var(--text)",
          fontFamily: "var(--font)",
        }}
        data-template={templateId}
      >
        <OrderTrackingPage
          initialOrder={orderData}
          orderId={orderId}
          slug={slug}
          storeName={site?.title || location.name}
          logoUrl={site?.logo_url ?? undefined}
        />
      </div>
    </>
  );
}
