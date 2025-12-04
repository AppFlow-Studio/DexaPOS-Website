import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Location } from '@/types/merchant_locations'

// ============================================================================
// Location Store - Centralized state for dashboard location scoping
// ============================================================================

interface LocationState {
    // Core state
    selectedLocationId: string // 'all' or UUID
    locations: Location[]
    isLoading: boolean
    isInitialized: boolean

    // Actions
    setSelectedLocation: (id: string) => void
    setLocations: (locations: Location[]) => void
    setLoading: (loading: boolean) => void
    initialize: () => void
    reset: () => void
}

// Initial state
const initialState = {
    selectedLocationId: 'all',
    locations: [],
    isLoading: false,
    isInitialized: false,
}

export const useLocationStore = create<LocationState>()(
    persist(
        (set, get) => ({
            ...initialState,

            setSelectedLocation: (id: string) => {
                set({ selectedLocationId: id })
                // Dispatch custom event for components that need to sync (e.g., sidebar)
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('locationChanged', { detail: id }))
                }
            },

            setLocations: (locations: Location[]) => {
                set({ locations })
            },

            setLoading: (loading: boolean) => {
                set({ isLoading: loading })
            },

            initialize: () => {
                set({ isInitialized: true })
            },

            reset: () => {
                set(initialState)
            },
        }),
        {
            name: 'location-storage',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                selectedLocationId: state.selectedLocationId,
            }),
        }
    )
)

// ============================================================================
// Selector Hooks - Computed values from store
// ============================================================================

export const useSelectedLocation = () => {
    const { selectedLocationId, locations } = useLocationStore()
    if (selectedLocationId === 'all') return null
    return locations.find(l => l.id === selectedLocationId) || null
}

export const useIsAllLocations = () => {
    return useLocationStore(state => state.selectedLocationId === 'all')
}

export const useLocationById = (id: string) => {
    return useLocationStore(state =>
        state.locations.find(l => l.id === id) || null
    )
}

// ============================================================================
// Helper Types
// ============================================================================

export type { LocationState }

