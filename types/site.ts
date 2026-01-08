export interface SiteThemeConfig {
  primaryColor?: string;
  secondaryColor?: string;
  heroImageUrl?: string | null;
  faviconUrl?: string | null;
  fontFamily?: string;
  borderRadius?: string;
  headerStyle?: "primary" | "dark" | "light";
}

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
  theme_config: SiteThemeConfig | null;
  online_ordering_config: OnlineOrderingConfig | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}
