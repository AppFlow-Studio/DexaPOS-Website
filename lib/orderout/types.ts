// ============================================================================
// OrderOut API Payload Types
// Matches the OrderOut Create Menu API specification
// ============================================================================

export interface OrderOutTranslation {
  translations: {
    en_us: string;
  };
}

// Uber Eats item suspension ("Sold Out"). suspend_until is unix SECONDS;
// null/past = available, a future timestamp = suspended/out of stock.
export interface OrderOutSuspension {
  suspend_until: number | null;
  reason?: string;
}

export interface OrderOutSuspensionInfo {
  suspension: OrderOutSuspension;
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
  // Present only when the item is out of stock (86'd) — keeps it on the menu as
  // "Sold Out" rather than removing it. Uber auto-restores at suspend_until.
  suspension_info?: OrderOutSuspensionInfo;
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
  // OrderOut/Uber nest the selection constraints under `quantity`. Emitting these
  // flat (min_permitted/max_permitted directly on quantity_info) is silently ignored
  // and the group defaults to "No limit".
  quantity_info: {
    quantity: {
      min_permitted: number;
      max_permitted: number;
    };
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
