export interface SiteThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  heroImageUrl?: string | null;
  faviconUrl?: string | null;
  fontFamily?: string;
  borderRadius?: string;
}

export interface Site {
  id: string;
  merchant_id: string;
  location_id: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  theme_config: SiteThemeConfig | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}
