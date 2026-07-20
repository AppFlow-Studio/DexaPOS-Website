import { cache } from "react";
import { createCmsReadClient } from "./supabase";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "./site-settings-data";

function mergeSettings(value: Partial<SiteSettings> | null): SiteSettings {
  if (!value) return DEFAULT_SITE_SETTINGS;

  return {
    ...DEFAULT_SITE_SETTINGS,
    ...value,
    nav_cta: { ...DEFAULT_SITE_SETTINGS.nav_cta, ...value.nav_cta },
    organization: { ...DEFAULT_SITE_SETTINGS.organization, ...value.organization },
    nav_links: value.nav_links || DEFAULT_SITE_SETTINGS.nav_links,
    footer_columns: value.footer_columns || DEFAULT_SITE_SETTINGS.footer_columns,
    footer_legal: value.footer_legal || DEFAULT_SITE_SETTINGS.footer_legal,
    social_links: value.social_links || DEFAULT_SITE_SETTINGS.social_links,
  };
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const supabase = createCmsReadClient();
    const { data } = await supabase
      .from("content_blocks")
      .select("content_json")
      .eq("key", "site-settings")
      .maybeSingle();

    return mergeSettings((data?.content_json as Partial<SiteSettings> | null) || null);
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
});
