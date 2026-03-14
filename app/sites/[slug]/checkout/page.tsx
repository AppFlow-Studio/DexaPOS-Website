import { getStorefrontData } from "../../actions";
import { notFound } from "next/navigation";
import { TEMPLATE_DEFAULTS, buildThemeVars } from "../../lib/theme-utils";
import { CheckoutPage } from "../../components/checkout/CheckoutPage";
import { CartRecovery } from "../../components/CartRecovery";
import { getRecoverySession } from "../../recovery-actions";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    recover?: string;
  }>;
}

export default async function CheckoutRoute({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { recover } = await searchParams;
  const { site, location } = await getStorefrontData(slug);

  if (!location) {
    notFound();
  }

  // Fetch recovery data if token present
  let recoveryData: { cartData: any[] | null; sessionToken: string | null; notificationId: string | null } | null = null;
  if (recover) {
    recoveryData = await getRecoverySession(recover);
  }

  const theme = site?.theme_config;
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const themeStyle = buildThemeVars(theme);
  const storeConfigId = site?.id || "";

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
        {recoveryData?.cartData && recoveryData.sessionToken && recoveryData.notificationId && (
          <CartRecovery
            cartData={recoveryData.cartData}
            sessionToken={recoveryData.sessionToken}
            notificationId={recoveryData.notificationId}
            storeConfigId={storeConfigId}
          />
        )}
        <CheckoutPage
          site={site}
          location={location}
          config={site?.online_ordering_config}
          storeConfigId={storeConfigId}
          slug={slug}
        />
      </div>
    </>
  );
}
