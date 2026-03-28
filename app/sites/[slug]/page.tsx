import { getStorefrontData } from "../actions";
import { notFound } from "next/navigation";
import { CartSidebar } from "../components/CartSidebar";
import { FloatingCartBar } from "../components/FloatingCartBar";
import { StorefrontLayout } from "../components/StorefrontLayout";
import { TEMPLATE_DEFAULTS, buildThemeVars } from "../lib/theme-utils";

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function StorefrontPage({ params }: PageProps) {
  const { slug } = await params;
  const { site, location, menus } = await getStorefrontData(slug);

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
        className="min-h-screen overflow-x-hidden"
        style={{
          ...themeStyle,
          backgroundColor: "var(--bg)",
          color: "var(--text)",
          fontFamily: "var(--font)",
        }}
        data-template={templateId}
      >
        <StorefrontLayout site={site} location={location} menus={menus} slug={slug} />
        <CartSidebar
          config={site?.online_ordering_config || undefined}
          storeConfigId={site?.id || ""}
          slug={slug}
        />
        <FloatingCartBar />
      </div>
    </>
  );
}
