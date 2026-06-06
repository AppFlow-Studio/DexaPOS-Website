import type {
  LocationModifierGroupOverridesModel,
  LocationModifierItemOverridesModel,
} from "@/types/db-modles";

export type LocationModifierGroupOverride = LocationModifierGroupOverridesModel;
export type LocationModifierItemOverride = LocationModifierItemOverridesModel;

export interface ModifierGroupOverrideData {
  is_active?: boolean;
  display_order?: number | null;
}

export interface ModifierItemOverrideData {
  price_modifier?: number | null;
  is_active?: boolean | null;
  display_order?: number | null;
  stock_tracking_mode?: "quantity" | "in_stock" | "out_of_stock" | null;
  current_stock?: number | null;
}
