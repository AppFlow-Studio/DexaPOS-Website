// ============================================================================
// FLOOR PLAN STORE - Client-side Zustand store
// ============================================================================

'use client'

import { create } from "zustand";
import { FloorPlan, FloorPlanObject, TableWithSession, WaitlistEntry, Reservation } from "@/types/floor-plan";
import { TableStatus } from "@/types/floor-plan";
import { RealtimeChannel } from "@supabase/supabase-js";
import { subscribeWithSelector } from "zustand/middleware";
import { persist, createJSONStorage } from "zustand/middleware";
import { createClient } from '@supabase/supabase-js';
import { TABLE_SHAPES } from "@/utils/tables/table-shapes";

// Helper to create authenticated Supabase client
function createAuthenticatedClient() {
    // For realtime, we'll use the publishable key
    // Auth will be handled via RLS policies
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
import {
    InitializeFloorPlan,
    LoadFloorPlanStatus,
    CreateFloorPlanAction,
    AddTableAction,
    UpdateTablePositionAction,
    UpdateTablePositionsBatchAction,
    RemoveTableAction,
    LoadWaitlistAction,
    LoadReservationsAction,
} from "@/app/dashboard/actions/floor-plan-actions";

interface FloorPlanState {
    // Data
    locationId: string | null;
    floorPlans: FloorPlan[];
    activeFloorPlanId: string | null;
    tables: TableWithSession[];
    waitlist: WaitlistEntry[];
    reservations: Reservation[];

    // UI State
    selectedTableIds: string[];
    isDesignMode: boolean;
    isLoading: boolean;
    error: string | null;
    lastSyncAt: Date | null;

    // Undo/Redo (design mode only)
    past: FloorPlanObject[][];
    future: FloorPlanObject[][];

    // Connection
    isOnline: boolean;
    realtimeChannel: RealtimeChannel | null;

    // Actions
    initialize: (locationId: string) => Promise<void>;
    cleanup: () => void;

    // Floor Plan Actions
    setActiveFloorPlan: (floorPlanId: string) => Promise<void>;
    createFloorPlan: (name: string, description?: string) => Promise<string>;
    loadFloorPlanStatus: () => Promise<void>;

    // Table Design Actions (Design Mode)
    setDesignMode: (enabled: boolean) => void;
    addTable: (tableData: Partial<FloorPlanObject>) => Promise<string>;
    updateTablePosition: (tableId: string, x: number, y: number, rotation?: number) => Promise<void>;
    updateTablePositionsBatch: (updates: Array<{ id: string; x: number; y: number; rotation?: number }>) => Promise<void>;
    removeTable: (tableId: string) => Promise<void>;

    // Selection Actions
    toggleTableSelection: (tableId: string) => void;
    clearSelection: () => void;
    selectMultipleTables: (tableIds: string[]) => void;

    // Waitlist Actions
    loadWaitlist: () => Promise<void>;

    // Reservation Actions
    loadReservations: (date?: string) => Promise<void>;

    // Undo/Redo (design mode)
    undo: () => void;
    redo: () => void;
    saveSnapshot: () => void;

    // Internal
    setupRealtimeSubscriptions: (locationId: string) => void;
}

export const useFloorPlanStore = create<FloorPlanState>()(
    subscribeWithSelector(
        persist(
            (set, get) => ({
                // Initial State
                locationId: null,
                floorPlans: [],
                activeFloorPlanId: null,
                tables: [],
                waitlist: [],
                reservations: [],
                selectedTableIds: [],
                isDesignMode: false,
                isLoading: false,
                error: null,
                lastSyncAt: null,
                past: [],
                future: [],
                isOnline: true,
                realtimeChannel: null,

                // ====================================================================
                // INITIALIZATION & CLEANUP
                // ====================================================================

                initialize: async (locationId: string) => {
                    set({ isLoading: true, locationId, error: null });
                    try {
                        // Load floor plans using server action
                        const floorPlans = await InitializeFloorPlan(locationId);

                        // Find default or first floor plan
                        const defaultPlan = floorPlans?.find((fp: FloorPlan) => fp.is_default) || floorPlans?.[0];

                        set({
                            floorPlans: floorPlans || [],
                            activeFloorPlanId: defaultPlan?.id || null
                        });

                        // Load status if we have a floor plan
                        if (defaultPlan?.id) {
                            await get().setActiveFloorPlan(defaultPlan.id);
                        }

                        // Load waitlist and reservations
                        await Promise.all([
                            get().loadWaitlist(),
                            get().loadReservations()
                        ]);

                        // Setup realtime subscriptions
                        get().setupRealtimeSubscriptions(locationId);

                        set({ isLoading: false, lastSyncAt: new Date() });
                    } catch (error: any) {
                        set({ isLoading: false, error: error.message });
                        throw error;
                    }
                },

                setupRealtimeSubscriptions: (locationId: string) => {
                    // Create Supabase client for realtime
                    const supabaseClient = createAuthenticatedClient();

                    // Clean up existing subscription
                    const existingChannel = get().realtimeChannel;
                    if (existingChannel) {
                        supabaseClient.removeChannel(existingChannel);
                    }

                    // Subscribe to table sessions (most frequent updates)
                    const channel = supabaseClient
                        .channel(`floor-plan-${locationId}`)
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'table_sessions',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                // Reload floor plan status
                                get().loadFloorPlanStatus();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'table_session_tables'
                            },
                            () => {
                                get().loadFloorPlanStatus();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'waitlist',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                get().loadWaitlist();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'reservations',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                get().loadReservations();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'floor_plan_objects',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                // Only reload in design mode or if objects change significantly
                                if (get().isDesignMode) {
                                    get().loadFloorPlanStatus();
                                }
                            }
                        )
                        .subscribe((status) => {
                            set({ isOnline: status === 'SUBSCRIBED' });
                        });

                    set({ realtimeChannel: channel });
                },

                cleanup: () => {
                    const channel = get().realtimeChannel;
                    if (channel) {
                        const supabaseClient = createAuthenticatedClient();
                        supabaseClient.removeChannel(channel);
                    }
                    set({
                        realtimeChannel: null,
                        locationId: null,
                        floorPlans: [],
                        activeFloorPlanId: null,
                        tables: [],
                        waitlist: [],
                        reservations: []
                    });
                },

                // ====================================================================
                // FLOOR PLAN ACTIONS
                // ====================================================================

                setActiveFloorPlan: async (floorPlanId: string) => {
                    set({ activeFloorPlanId: floorPlanId, isLoading: true });
                    await get().loadFloorPlanStatus();
                    set({ isLoading: false });
                },

                createFloorPlan: async (name: string, description?: string) => {
                    const locationId = get().locationId;
                    if (!locationId) throw new Error('No location set');

                    const { floorPlanId, floorPlans } = await CreateFloorPlanAction(locationId, name, description);

                    set({ floorPlans });

                    return floorPlanId;
                },

                loadFloorPlanStatus: async () => {
                    const floorPlanId = get().activeFloorPlanId;
                    if (!floorPlanId) return;

                    try {
                        const { tables } = await LoadFloorPlanStatus(floorPlanId);
                        set({
                            tables: tables || [],
                            lastSyncAt: new Date()
                        });
                    } catch (error: any) {
                        set({ error: error.message });
                    }
                },

                // ====================================================================
                // TABLE DESIGN ACTIONS (Design Mode)
                // ====================================================================

                setDesignMode: (enabled: boolean) => {
                    set({ isDesignMode: enabled, selectedTableIds: [] });
                    if (!enabled) {
                        // Clear undo history when exiting design mode
                        set({ past: [], future: [] });
                    }
                },

                addTable: async (tableData: Partial<FloorPlanObject>) => {
                    const floorPlanId = get().activeFloorPlanId;
                    if (!floorPlanId) throw new Error('No floor plan selected');

                    get().saveSnapshot();

                    const shape = TABLE_SHAPES[tableData.shape_id as keyof typeof TABLE_SHAPES];

                    const { objectId } = await AddTableAction(floorPlanId, {
                        name: tableData.name || `Table ${get().tables.length + 1}`,
                        shape_id: tableData.shape_id as string,
                        category: shape?.category || 'table',
                        x: tableData.x || 100,
                        y: tableData.y || 100,
                        rotation: tableData.rotation || 0,
                        capacity: shape?.capacity || null,
                        width: shape?.width || null,
                        height: shape?.height || null,
                    });

                    await get().loadFloorPlanStatus();

                    return objectId;
                },

                updateTablePosition: async (tableId: string, x: number, y: number, rotation?: number) => {
                    // Optimistic update
                    set(state => ({
                        tables: state.tables.map(t =>
                            t.id === tableId ? { ...t, x, y, rotation: rotation ?? t.rotation } : t
                        )
                    }));

                    try {
                        await UpdateTablePositionAction(tableId, x, y, rotation);
                    } catch (error) {
                        // Revert on error
                        await get().loadFloorPlanStatus();
                        throw error;
                    }
                },

                updateTablePositionsBatch: async (updates) => {
                    // Optimistic update
                    set(state => ({
                        tables: state.tables.map(t => {
                            const update = updates.find(u => u.id === t.id);
                            return update ? { ...t, x: update.x, y: update.y, rotation: update.rotation ?? t.rotation } : t;
                        })
                    }));

                    try {
                        await UpdateTablePositionsBatchAction(updates);
                    } catch (error) {
                        await get().loadFloorPlanStatus();
                        throw error;
                    }
                },

                removeTable: async (tableId: string) => {
                    get().saveSnapshot();

                    await RemoveTableAction(tableId);

                    set(state => ({
                        tables: state.tables.filter(t => t.id !== tableId),
                        selectedTableIds: state.selectedTableIds.filter(id => id !== tableId)
                    }));
                },

                // ====================================================================
                // SELECTION ACTIONS
                // ====================================================================

                toggleTableSelection: (tableId: string) => {
                    set(state => ({
                        selectedTableIds: state.selectedTableIds.includes(tableId)
                            ? state.selectedTableIds.filter(id => id !== tableId)
                            : [...state.selectedTableIds, tableId]
                    }));
                },

                clearSelection: () => set({ selectedTableIds: [] }),

                selectMultipleTables: (tableIds: string[]) => set({ selectedTableIds: tableIds }),

                // ====================================================================
                // WAITLIST ACTIONS
                // ====================================================================

                loadWaitlist: async () => {
                    const locationId = get().locationId;
                    if (!locationId) return;

                    try {
                        const waitlist = await LoadWaitlistAction(locationId);
                        set({ waitlist: waitlist || [] });
                    } catch (error) {
                        console.error('Failed to load waitlist:', error);
                    }
                },

                // ====================================================================
                // RESERVATION ACTIONS
                // ====================================================================

                loadReservations: async (date?: string) => {
                    const locationId = get().locationId;
                    if (!locationId) return;

                    try {
                        const reservations = await LoadReservationsAction(locationId, date);
                        set({ reservations: reservations || [] });
                    } catch (error) {
                        console.error('Failed to load reservations:', error);
                    }
                },

                // ====================================================================
                // UNDO/REDO (Design Mode Only)
                // ====================================================================

                saveSnapshot: () => {
                    const tables = get().tables.map(t => {
                        const { session, next_reservation, ...rest } = t;
                        return rest;
                    });

                    set(state => ({
                        past: [...state.past.slice(-19), tables], // Keep last 20
                        future: []
                    }));
                },

                undo: () => {
                    set(state => {
                        if (state.past.length === 0) return state;

                        const previous = state.past[state.past.length - 1];
                        const current = state.tables.map(t => {
                            const { session, next_reservation, ...rest } = t;
                            return rest;
                        });

                        return {
                            tables: previous.map(t => ({ ...t, session: null, next_reservation: null })) as TableWithSession[],
                            past: state.past.slice(0, -1),
                            future: [current, ...state.future]
                        };
                    });
                },

                redo: () => {
                    set(state => {
                        if (state.future.length === 0) return state;

                        const next = state.future[0];
                        const current = state.tables.map(t => {
                            const { session, next_reservation, ...rest } = t;
                            return rest;
                        });

                        return {
                            tables: next.map(t => ({ ...t, session: null, next_reservation: null })) as TableWithSession[],
                            past: [...state.past, current],
                            future: state.future.slice(1)
                        };
                    });
                }
            }),
            {
                name: 'floor-plan-storage',
                storage: createJSONStorage(() => localStorage),
                partialize: (state) => ({
                    // Only persist essential data, not realtime state
                    activeFloorPlanId: state.activeFloorPlanId,
                    isDesignMode: state.isDesignMode
                })
            }
        )
    )
);

