import { create } from "zustand";
import { persist } from "zustand/middleware";
import { StorefrontItem, StorefrontModifierOption } from "@/types/storefront";
import {
  getStorefrontBrowsePrice,
  getStorefrontCashPrice,
} from "../lib/storefront-pricing";

export interface CartItem extends StorefrontItem {
  cartItemId: string; // Unique ID for this instance in cart
  quantity: number;
  selectedModifiers: StorefrontModifierOption[];
  notes?: string;
  totalPrice: number; // Unit price (base + modifiers)
}

/**
 * The single source of truth for what a cart line costs the customer.
 * MUST mirror the server pricing in supabase/functions/create-online-order:
 *   - separate delivery pricing ON  + delivery order → delivery price
 *   - pickup + pay cash in store               → cash price
 *   - separate delivery pricing ON  + pickup order   → regular price
 *   - separate delivery pricing OFF (any order type) → regular price
 * Adds selected modifier prices. Use this everywhere the customer is shown a
 * price for an in-cart item (subtotal, confirmation receipt) so the displayed
 * total always equals what the server charges and what order tracking shows.
 */
export function resolveCartUnitPrice(
  item: CartItem,
  orderType: "pickup" | "delivery",
  deliveryPricingEnabled: boolean,
  useCashPrice = false
): number {
  const base =
    deliveryPricingEnabled && orderType === "delivery"
      ? item.delivery_price ?? item.price
      : useCashPrice && orderType === "pickup"
        ? getStorefrontCashPrice(item)
      : item.price;
  const modifiers = (item.selectedModifiers ?? []).reduce(
    (sum, m) => sum + m.price,
    0
  );
  return base + modifiers;
}

interface CartStore {
  // State
  items: CartItem[];
  isOpen: boolean;
  goGreen: boolean;
  pendingModalItem: StorefrontItem | null;

  // Actions
  addItem: (
    item: StorefrontItem,
    quantity?: number,
    modifiers?: StorefrontModifierOption[],
    notes?: string
  ) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  setOpen: (isOpen: boolean) => void;
  setGoGreen: (goGreen: boolean) => void;
  requestOpenModal: (item: StorefrontItem) => void;
  clearPendingModalItem: () => void;

  // Getters
  getSubtotal: () => number;
  getTotalItems: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      goGreen: false,
      pendingModalItem: null,

      addItem: (item, quantity = 1, modifiers = [], notes = "") => {
        set((state) => {
          // Calculate unit price with modifiers
          const modifiersPrice = modifiers.reduce(
            (acc, mod) => acc + mod.price,
            0
          );
          // Browse/cart surfaces don't know the final fulfillment mode yet, so
          // they must default to the regular online price instead of assuming
          // delivery pricing.
          const basePrice = getStorefrontBrowsePrice(item);
          const unitPrice = basePrice + modifiersPrice;

          // Signature that decides whether an add merges into an existing line.
          // Price is part of it: the same menu_item can appear in several menus at
          // different prices (e.g. Americano $6 on one menu, $10 on another). Those
          // are genuinely different line items and must not collapse into one — the
          // merged line would otherwise silently bill both at the first line's price.
          const priceKey = [
            item.price,
            item.cash_price,
            item.delivery_price,
          ].join("/");
          const sortedModIds = modifiers
            .map((m) => m.id)
            .sort()
            .join(",");
          const itemSignature = `${item.id}|${priceKey}|${sortedModIds}|${notes}`;

          // Check if exactly same item configuration (incl. price) exists
          const existingItemIndex = state.items.findIndex((i) => {
            const iPriceKey = [i.price, i.cash_price, i.delivery_price].join("/");
            const iSignature = `${i.id}|${iPriceKey}|${i.selectedModifiers
              .map((m) => m.id)
              .sort()
              .join(",")}|${i.notes || ""}`;
            return iSignature === itemSignature;
          });

          if (existingItemIndex > -1) {
            const newItems = [...state.items];
            newItems[existingItemIndex].quantity += quantity;
            return { items: newItems, isOpen: true };
          }

          return {
            items: [
              ...state.items,
              {
                ...item,
                cartItemId: `${item.id}-${Date.now()}`,
                quantity,
                selectedModifiers: modifiers,
                notes,
                totalPrice: unitPrice,
              },
            ],
            isOpen: true,
          };
        });
      },

      removeItem: (cartItemId) => {
        set((state) => ({
          items: state.items.filter((i) => i.cartItemId !== cartItemId),
        }));
      },

      updateQuantity: (cartItemId, quantity) => {
        set((state) => {
          if (quantity <= 0) {
            return {
              items: state.items.filter((i) => i.cartItemId !== cartItemId),
            };
          }
          return {
            items: state.items.map((i) =>
              i.cartItemId === cartItemId ? { ...i, quantity } : i
            ),
          };
        });
      },

      clearCart: () => {
        set({ items: [] });
      },

      toggleCart: () => {
        set((state) => ({ isOpen: !state.isOpen }));
      },

      setOpen: (isOpen) => {
        set({ isOpen });
      },

      setGoGreen: (goGreen) => {
        set({ goGreen });
      },

      requestOpenModal: (item) => set({ pendingModalItem: item }),
      clearPendingModalItem: () => set({ pendingModalItem: null }),

      getSubtotal: () => {
        const { items } = get();
        return items.reduce(
          (total, item) => total + item.totalPrice * item.quantity,
          0
        );
      },

      getTotalItems: () => {
        const { items } = get();
        return items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: "storefront-cart-storage",
      partialize: (state) => ({ items: state.items, isOpen: state.isOpen, goGreen: state.goGreen }),
    }
  )
);
