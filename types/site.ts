export interface SiteThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  templateId?: "classic" | "hero" | "market" | "boutique";
  heroImageUrl?: string | null;
  /** Optional ambient video for hero (e.g. steam, latte pour). Supports mp4, webm. */
  heroVideoUrl?: string | null;
  faviconUrl?: string | null;
  headerStyle?: "filled" | "transparent" | "outlined";
  headerTextColor?: string | null;
  borderColor?: string | null;
  cardColor?: string | null;
}

export type StorefrontTemplateId = NonNullable<SiteThemeConfig["templateId"]>;

// Schedule Types
export interface DaySchedule {
  enabled: boolean;
  from: string; // "09:00"
  to: string; // "21:00"
  is24Hours: boolean;
}

export interface WeeklySchedule {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface OnlineOrderingConfig {
  // Hours
  operatingHours?: WeeklySchedule;
  useCustomDeliveryHours?: boolean;
  deliveryHours?: WeeklySchedule;

  // Pickup & Delivery
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  /**
   * When true (default), online orders use the item's delivery_price
   * (separate online/delivery pricing). When false, online orders use the
   * regular item price — no online upcharge. Applied consistently across the
   * storefront display and the create-online-order edge function.
   */
  deliveryPricingEnabled?: boolean;
  preparationLeadTime?: number; // minutes
  acceptFutureOrdersOnly?: boolean;
  futureOrderMinDays?: number;
  futureOrderMaxDays?: number;
  minimumOrderAmount?: number;

  // Payment
  acceptOnlinePayments?: boolean;
  acceptCashOnDelivery?: boolean;
  acceptCardOnDelivery?: boolean;

  // Tipping
  tippingEnabled?: boolean;
  tipConfig?: {
    calculationMethod?: "subtotal" | "total";
    presetPercentages?: number[];
    smartTipEnabled?: boolean;
    smartTipThreshold?: number;
    smartTipAmounts?: number[];
    allowCustomTip?: boolean;
  };

  // Delivery
  baseDeliveryFee?: number;
  freeDeliveryThreshold?: number;
  deliveryZones?: Array<{
    id: string;
    name: string;
    radiusMiles: number;
    fee: number;
    minimumOrder: number;
  }>;

  // Convenience Fee
  convenienceFeeEnabled?: boolean;
  convenienceFeePercent?: number;
  convenienceFeeFlat?: number;

  // UI Options
  goGreenOptionEnabled?: boolean;
  /** Menu item card layout: cards (image on top), sidebyside (image on right), no-images */
  menuLayout?: "cards" | "sidebyside" | "no-images";

  // Visibility
  hideFromLocationPicker?: boolean;
  dontMarkClosedOutsideHours?: boolean;

  // Notifications
  sendEmailOnNewOrder?: boolean;
  notificationEmail?: string;

  // Automation
  autoAcceptOrders?: boolean;
  autoClosePaidOrders?: boolean;

  // Integrations
  onfleetEnabled?: boolean;
  onfleetApiKey?: string;
  shipdayEnabled?: boolean;
  shipdayApiKey?: string;
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
  banner_text: string | null;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
    lat?: number;
    lng?: number;
  } | null;
  theme_config: SiteThemeConfig | null;
  online_ordering_config: OnlineOrderingConfig | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  /** SEO: used for page title and meta description (from dashboard SEO & Analytics). */
  meta_title?: string | null;
  meta_description?: string | null;
  google_analytics_id?: string | null;
  facebook_pixel_id?: string | null;
  /** Social sharing: image for Open Graph / Twitter (from dashboard). */
  og_image_url?: string | null;
}

// ── online_store_config ──────────────────────────────────────────────

export interface OnlineStoreConfig {
  id: string;
  merchant_id: string;
  location_id: string;

  slug: string;
  custom_domain: string | null;
  store_name: string;

  template_id: "classic" | "hero" | "market" | "boutique";
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string;
  text_color: string;
  border_color?: string | null;
  card_color?: string | null;
  font_family: string | null;

  logo_url: string | null;
  hero_image_url: string | null;
  favicon_url: string | null;
  og_image_url: string | null;

  description: string | null;
  phone: string | null;
  email: string | null;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
    lat?: number;
    lng?: number;
  } | null;

  operating_hours: OperatingHoursEntry[];

  is_active: boolean;
  accepts_pickup: boolean;
  accepts_delivery: boolean;
  min_order_cents: number;
  estimated_prep_minutes: number;
  max_future_order_days: number;

  delivery_fee_cents: number;
  free_delivery_threshold_cents: number | null;
  delivery_radius_miles: number | null;

  tip_enabled: boolean;
  tip_presets: number[];

  ipospays_tpn: string | null;

  meta_title: string | null;
  meta_description: string | null;

  google_analytics_id: string | null;
  facebook_pixel_id: string | null;

  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperatingHoursEntry {
  day: number; // 0 = Sunday
  open: string; // "09:00"
  close: string; // "22:00"
  is_closed: boolean;
}

// ── online_store_pages ───────────────────────────────────────────────

export type StorePageType = "home" | "about" | "custom";
export type StoreSectionType =
  | "hero"
  | "announcement"
  | "about"
  | "gallery"
  | "hours"
  | "location_map"
  | "reviews"
  | "custom_html";

export interface OnlineStorePage {
  id: string;
  store_config_id: string;
  page_type: StorePageType;
  section_type: StoreSectionType;
  title: string | null;
  subtitle: string | null;
  body_text: string | null;
  image_url: string | null;
  images: string[] | null;
  cta_text: string | null;
  cta_link: string | null;
  display_order: number;
  is_visible: boolean;
  style_overrides: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── delivery_zones ───────────────────────────────────────────────────

export interface DeliveryZone {
  id: string;
  store_config_id: string;
  zone_name: string;
  zone_type: "radius" | "polygon";
  radius_miles: number | null;
  polygon_coordinates: [number, number][] | null;
  delivery_fee_cents: number;
  min_order_cents: number;
  free_delivery_threshold_cents: number | null;
  estimated_minutes: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// ── online_order_sessions ────────────────────────────────────────────

export interface OnlineOrderSession {
  id: string;
  store_config_id: string;
  customer_id: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  supabase_auth_id: string | null;
  is_authenticated: boolean;
  order_type: "pickup" | "delivery" | null;
  delivery_address: Record<string, unknown> | null;
  delivery_zone_id: string | null;
  cart_data: unknown[];
  loyalty_points_balance: number;
  loyalty_points_to_apply: number;
  order_id: string | null;
  requested_time: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}
