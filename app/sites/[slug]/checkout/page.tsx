import { getStorefrontData } from "../../actions";
import { notFound } from "next/navigation";
import { TEMPLATE_DEFAULTS, buildThemeVars } from "../../lib/theme-utils";
import { CheckoutPage } from "../../components/checkout/CheckoutPage";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CheckoutRoute({ params }: PageProps) {
  const { slug } = await params;
  const { site, location } = await getStorefrontData(slug);

  if (!location) {
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
        <CheckoutPage
          site={site}
          location={location}
          config={site?.online_ordering_config}
          storeConfigId={site?.id || ""}
          slug={slug}
        />
      </div>
    </>
  );
}
