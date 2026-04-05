import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSession } from "../session-actions";

export interface SessionCustomer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
}

interface SessionStore {
  sessionToken: string | null;
  customer: SessionCustomer | null;
  isAuthenticated: boolean;
  storeConfigId: string | null;
  activeOrderId: string | null;

  login: (token: string, customer: SessionCustomer) => void;
  logout: () => void;
  setCustomer: (customer: Partial<SessionCustomer>) => void;
  setStoreConfigId: (id: string) => void;
  initSessionToken: (token: string, configId: string) => void;
  refreshSession: () => Promise<boolean>;
  setActiveOrderId: (id: string | null) => void;
}

export const useSession = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessionToken: null,
      customer: null,
      isAuthenticated: false,
      storeConfigId: null,
      activeOrderId: null,

      login: (token, customer) => {
        set({
          sessionToken: token,
          customer,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          sessionToken: null,
          customer: null,
          isAuthenticated: false,
          activeOrderId: null,
        });
      },

      setActiveOrderId: (id) => set({ activeOrderId: id }),

      setCustomer: (updates) => {
        const current = get().customer;
        if (!current) return;
        set({
          customer: { ...current, ...updates },
        });
      },

      setStoreConfigId: (id) => {
        set({ storeConfigId: id });
      },

      initSessionToken: (token, configId) => {
        set({
          sessionToken: token,
          storeConfigId: configId,
          isAuthenticated: false,
          customer: null,
        });
      },

      refreshSession: async () => {
        const token = get().sessionToken;
        if (!token) return false;

        try {
          const result = await getSession(token);
          if (!result.data) {
            set({
              sessionToken: null,
              customer: null,
              isAuthenticated: false,
            });
            return false;
          }

          const s = result.data;
          set({
            isAuthenticated: s.isAuthenticated,
            customer: s.customerId
              ? {
                  id: s.customerId,
                  name: s.customerName,
                  phone: s.customerPhone ?? "",
                  email: s.customerEmail,
                }
              : get().customer,
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "storefront-session",
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        customer: state.customer,
        isAuthenticated: state.isAuthenticated,
        storeConfigId: state.storeConfigId,
        activeOrderId: state.activeOrderId,
      }),
    }
  )
);
