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
  delivery_price: number;
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
  site: any;
  location: any;
  menus: StorefrontMenu[];
}

// Guest system types

export interface GuestSession {
  id: string;
  sessionToken: string;
  storeConfigId: string;
  customerId: string | null;
  customerPhone: string | null;
  customerName: string | null;
  customerEmail: string | null;
  isAuthenticated: boolean;
  orderType: "pickup" | "delivery" | null;
  deliveryAddress: any | null;
  cartData: any[];
  loyaltyPointsBalance: number;
  loyaltyPointsToApply: number;
  orderId: string | null;
  requestedTime: string | null;
  expiresAt: string | null;
}

export interface SavedAddress {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  deliveryNotes: string | null;
  isDefault: boolean;
}

export interface OrderHistoryItem {
  id: string;
  orderNumber: string;
  displayNumber: string;
  orderType: string;
  status: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  createdAt: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
}

export interface LoyaltyStatus {
  programId: string;
  programName: string;
  programType: string;
  currentPoints: number;
  currentPunches: number;
  currentVisits: number;
  lifetimePoints: number;
  availableRewards: {
    id: string;
    description: string;
    rewardType: string;
    rewardValue: number;
    expiresAt: string | null;
  }[];
}
