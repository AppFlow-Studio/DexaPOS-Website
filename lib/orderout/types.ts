// ============================================================================
// OrderOut API Payload Types
// Matches the OrderOut Create Menu API specification
// ============================================================================

export interface OrderOutTranslation {
  translations: {
    en_us: string;
  };
}

export interface OrderOutItem {
  id: string;
  title: OrderOutTranslation;
  description: OrderOutTranslation;
  price_info: {
    price: number; // cents
  };
  modifier_group_ids: {
    ids: string[];
  };
}

export interface OrderOutCategoryEntity {
  type: "ITEM";
  id: string;
}

export interface OrderOutCategory {
  id: string;
  title: OrderOutTranslation;
  entities: OrderOutCategoryEntity[];
}

export interface OrderOutTimePeriod {
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
}

export interface OrderOutServiceAvailability {
  day_of_week: string; // "sunday", "monday", etc.
  time_periods: OrderOutTimePeriod[];
}

export interface OrderOutMenu {
  id: string;
  title: OrderOutTranslation;
  category_ids: string[];
  service_availability: OrderOutServiceAvailability[];
}

export interface OrderOutModifierOption {
  type: "ITEM";
  id: string;
}

export interface OrderOutModifierGroup {
  id: string;
  title: OrderOutTranslation;
  modifier_options: OrderOutModifierOption[];
  quantity_info: {
    min_permitted: number;
    max_permitted: number | null;
  };
}

export interface OrderOutDisplayOptions {
  disable_item_instructions: boolean;
}

export interface OrderOutMenuPayload {
  name: string;
  items: OrderOutItem[];
  categories: OrderOutCategory[];
  menus: OrderOutMenu[];
  modifier_groups: OrderOutModifierGroup[];
  display_options: OrderOutDisplayOptions;
}
