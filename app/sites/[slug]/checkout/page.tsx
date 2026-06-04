import { getStorefrontData } from "../../actions";
import { getStoreTaxRate } from "../../order-actions";
import { notFound } from "next/navigation";
import { TEMPLATE_DEFAULTS, buildThemeVars } from "../../lib/theme-utils";
import { CheckoutPage } from "../../components/checkout/CheckoutPage";
import { StorefrontRoot } from "../../components/StorefrontRoot";
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
  const { site, location, pricingDisclosureText } = await getStorefrontData(slug);

  if (!location) {
    notFound();
  }

  const taxRate = site?.id ? await getStoreTaxRate(site.id) : 0;

  // Fetch recovery data if token present
  let recoveryData: { cartData: any[] | null; sessionToken: string | null; notificationId: string | null } | null = null;
  if (recover) {
    recoveryData = await getRecoverySession(recover);
  }

  const storeConfigId = site?.id || "";

  const theme = site?.theme_config;
  const templateId = theme?.templateId || "classic";
  const defaults = TEMPLATE_DEFAULTS[templateId];
  const themeStyle = buildThemeVars(theme);
  // Ordering flow uses a neutral white chassis regardless of merchant theme —
  // brand color still applies to CTAs/accents via --primary. (DoD: no cream outside hero)
  const bgColor = "#FFFFFF";
  const textColor = (themeStyle as Record<string, string>)["--text"] ?? defaults.text;
  const rootVarsCss = [
    `:root { ${Object.entries(themeStyle).map(([k, v]) => `${k}: ${v}`).join("; ")} }`,
    `:root, body { font-family: var(--font); }`,
  ].join("\n");
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
          taxRate={taxRate}
          pricingDisclosureText={pricingDisclosureText}
        />
      </StorefrontRoot>
    </>
  );
}
