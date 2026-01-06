export interface StorefrontModifierOption {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
  display_order: number;
}

export interface StorefrontModifierGroup {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number | null;
  required: boolean;
  options: StorefrontModifierOption[];
}

export interface StorefrontItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  availability: boolean;
  modifier_groups?: StorefrontModifierGroup[];
}

export interface StorefrontCategory {
  id: string;
  name: string;
  display_order: number | null;
  items: StorefrontItem[];
}

export interface StorefrontMenu {
  id: string;
  name: string;
  categories: StorefrontCategory[];
}

export interface StorefrontData {
  site: any; // We can improve this type later
  location: any;
  menus: StorefrontMenu[];
}
