import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Location } from "@/types/merchant_locations";

// ============================================================================
// Location Store - Centralized state for dashboard location scoping
// ============================================================================

interface LocationState {
  // Core state
  selectedLocationId: string; // 'all' or UUID
  locations: Location[];
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  setSelectedLocation: (id: string) => void;
  setLocations: (locations: Location[]) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => void;
  validateSelectedLocation: (locations: Location[]) => void;
  reset: () => void;
}

// Initial state
const initialState = {
  selectedLocationId: "all",
  locations: [],
  isLoading: false,
  isInitialized: false,
};

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSelectedLocation: (id: string) => {
        set({ selectedLocationId: id });
        // Sync to cookie for server-side access (e.g. audit logging)
        if (typeof document !== "undefined") {
          document.cookie = `x-location-id=${id}; path=/; max-age=31536000; SameSite=Lax`;
        }
        // Dispatch custom event for components that need to sync (e.g., sidebar)
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("locationChanged", { detail: id }),
          );
        }
      },

      setLocations: (locations: Location[]) => {
        const currentState = get();
        // Only update if we have new locations or current locations are empty.
        // This prevents clearing locations during transient refetches, while
        // still allowing an authoritative empty result for first-time merchants.
        if (locations.length > 0 || currentState.locations.length === 0) {
          set({ locations });
          // Always validate — covers stale persisted IDs AND the 0-locations case
          get().validateSelectedLocation(locations);
        }
      },

      validateSelectedLocation: (locations: Location[]) => {
        const { selectedLocationId } = get();

        // If 'all' is selected, no validation needed
        if (selectedLocationId === "all") return;

        // If no locations exist, reset to 'all' so we don't get stuck
        // pointing at a stale/deleted UUID (causes "Unknown Location" UI).
        if (locations.length === 0) {
          set({ selectedLocationId: "all" });
          if (typeof document !== "undefined") {
            document.cookie = `x-location-id=all; path=/; max-age=31536000; SameSite=Lax`;
          }
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("locationChanged", { detail: "all" }),
            );
          }
          return;
        }

        // Check if selected location exists in locations array
        const exists = locations.some((l) => l.id === selectedLocationId);

        if (!exists) {
          // Find primary location first, then fallback to first available
          const primaryLocation = locations.find(
            (l) => (l as any).is_primary_location === true,
          );
          const fallbackId = primaryLocation?.id || locations[0].id;
          set({ selectedLocationId: fallbackId });

          // Sync to cookie
          if (typeof document !== "undefined") {
            document.cookie = `x-location-id=${fallbackId}; path=/; max-age=31536000; SameSite=Lax`;
          }

          // Dispatch event for components that need to sync
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("locationChanged", { detail: fallbackId }),
            );
          }
        }
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      initialize: () => {
        set({ isInitialized: true });
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "location-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedLocationId: state.selectedLocationId,
      }),
      onRehydrateStorage: () => (state) => {
        // Validate persisted state after rehydration
        if (state && state.locations && state.locations.length > 0) {
          state.validateSelectedLocation(state.locations);
        }
        // Also ensure cookie is set on rehydration
        if (state?.selectedLocationId && typeof document !== "undefined") {
          document.cookie = `x-location-id=${state.selectedLocationId}; path=/; max-age=31536000; SameSite=Lax`;
        }
      },
    },
  ),
);

// ============================================================================
// Selector Hooks - Computed values from store
// ============================================================================

export const useSelectedLocation = () => {
  const { selectedLocationId, locations } = useLocationStore();
  if (selectedLocationId === "all") return null;
  return locations.find((l) => l.id === selectedLocationId) || null;
};

export const useIsAllLocations = () => {
  return useLocationStore((state) => state.selectedLocationId === "all");
};

export const useLocationById = (id: string) => {
  return useLocationStore(
    (state) => state.locations.find((l) => l.id === id) || null,
  );
};

export const useHasLocations = () => {
  return useLocationStore((state) => state.locations.length > 0);
};

// ============================================================================
// Helper Types
// ============================================================================

export type { LocationState };
