import { getStorefrontData } from "../../actions";
import { notFound } from "next/navigation";
import { TEMPLATE_DEFAULTS, buildThemeVars, FONT_GOOGLE_URLS } from "../../lib/theme-utils";
import { StoreInfoPageContent } from "../../components/StoreInfoPageContent";
import { StorefrontRoot } from "../../components/StorefrontRoot";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function StoreInfoPage({ params }: PageProps) {
  const { slug } = await params;
  const { site, location } = await getStorefrontData(slug);

  if (!location) {
    notFound();
  }

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
      {theme?.fontFamily && FONT_GOOGLE_URLS[theme.fontFamily] && FONT_GOOGLE_URLS[theme.fontFamily] !== defaults.fontUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={FONT_GOOGLE_URLS[theme.fontFamily]} />
      )}
      <StorefrontRoot
        themeStyle={themeStyle}
        templateId={templateId}
        baseBgColor={bgColor}
        baseTextColor={textColor}
        className="min-h-screen overflow-y-auto"
      >
        <StoreInfoPageContent site={site} location={location} slug={slug} />
      </StorefrontRoot>
    </>
  );
}
