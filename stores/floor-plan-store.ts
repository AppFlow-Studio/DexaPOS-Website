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
    UpdateTableNameAction,
    UpdateTableRotationAction,
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

    // Draft State (local-only, not yet saved to DB)
    draftTables: FloorPlanObject[];
    originalTables: FloorPlanObject[]; // Snapshot of last saved state
    lastDraftSavedAt: Date | null;

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

    // Draft Actions (Local-only, no DB calls)
    initializeDraft: (tables: FloorPlanObject[]) => void;
    resetDraft: () => void;
    addTableToDraft: (tableData: Partial<FloorPlanObject>) => string; // Returns temp ID
    updateTableInDraft: (tableId: string, updates: Partial<FloorPlanObject>) => void;
    updateTablePositionInDraft: (tableId: string, x: number, y: number) => void;
    updateTableRotationInDraft: (tableId: string, rotation: number) => void;
    updateTableNameInDraft: (tableId: string, name: string) => void;
    removeTableFromDraft: (tableId: string) => void;

    // Batch save draft to database
    saveDraftToDatabase: () => Promise<void>;

    // Legacy actions (kept for compatibility, but will be deprecated)
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

    // Computed state
    hasUnsavedChanges: () => boolean;

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
                draftTables: [],
                originalTables: [],
                lastDraftSavedAt: null,
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
                        // Clear undo history and draft when exiting design mode
                        set({ past: [], future: [], draftTables: [], originalTables: [] });
                    }
                },

                // ====================================================================
                // DRAFT ACTIONS (Local-only, no DB calls)
                // ====================================================================

                initializeDraft: (tables: FloorPlanObject[]) => {
                    set({
                        draftTables: tables.map(t => ({ ...t })), // Deep clone
                        originalTables: tables.map(t => ({ ...t })), // Deep clone
                        past: [],
                        future: [],
                        lastDraftSavedAt: null
                    });
                },

                resetDraft: () => {
                    const original = get().originalTables;
                    set({
                        draftTables: original.map(t => ({ ...t })), // Reset to original
                        past: [],
                        future: []
                    });
                },

                addTableToDraft: (tableData: Partial<FloorPlanObject>) => {
                    const floorPlanId = get().activeFloorPlanId;
                    if (!floorPlanId) throw new Error('No floor plan selected');

                    get().saveSnapshot();

                    const shape = TABLE_SHAPES[tableData.shape_id as keyof typeof TABLE_SHAPES];
                    const tempId = `temp-${Date.now()}-${Math.random()}`;

                    const newTable: FloorPlanObject = {
                        id: tempId,
                        floor_plan_id: floorPlanId,
                        name: tableData.name || `New ${shape?.label || 'Table'}`,
                        shape_id: tableData.shape_id as keyof typeof TABLE_SHAPES,
                        category: (shape?.category || tableData.category || 'table') as FloorPlanObject['category'],
                        x: tableData.x || 100,
                        y: tableData.y || 100,
                        rotation: tableData.rotation || 0,
                        width: tableData.width || shape?.width,
                        height: tableData.height || shape?.height,
                        capacity: tableData.capacity || shape?.capacity,
                        z_index: tableData.z_index || 1,
                        is_active: tableData.is_active !== undefined ? tableData.is_active : true,
                        is_visible: tableData.is_visible !== undefined ? tableData.is_visible : true,
                    };

                    set(state => ({
                        draftTables: [...state.draftTables, newTable]
                    }));

                    return tempId;
                },

                updateTableInDraft: (tableId: string, updates: Partial<FloorPlanObject>) => {
                    set(state => ({
                        draftTables: state.draftTables.map(t =>
                            t.id === tableId ? { ...t, ...updates } : t
                        )
                    }));
                },

                updateTablePositionInDraft: (tableId: string, x: number, y: number) => {
                    set(state => ({
                        draftTables: state.draftTables.map(t =>
                            t.id === tableId ? { ...t, x, y } : t
                        )
                    }));
                },

                updateTableRotationInDraft: (tableId: string, rotation: number) => {
                    set(state => ({
                        draftTables: state.draftTables.map(t =>
                            t.id === tableId ? { ...t, rotation } : t
                        )
                    }));
                },

                updateTableNameInDraft: (tableId: string, name: string) => {
                    get().saveSnapshot();
                    set(state => ({
                        draftTables: state.draftTables.map(t =>
                            t.id === tableId ? { ...t, name, label_override: name } : t
                        )
                    }));
                },

                removeTableFromDraft: (tableId: string) => {
                    get().saveSnapshot();
                    set(state => ({
                        draftTables: state.draftTables.filter(t => t.id !== tableId),
                        selectedTableIds: state.selectedTableIds.filter(id => id !== tableId)
                    }));
                },

                saveDraftToDatabase: async () => {
                    const floorPlanId = get().activeFloorPlanId;
                    if (!floorPlanId) throw new Error('No floor plan selected');

                    const draftTables = get().draftTables;
                    const originalTables = get().originalTables;

                    // Identify changes
                    const originalMap = new Map(originalTables.map(t => [t.id, t]));
                    const draftMap = new Map(draftTables.map(t => [t.id, t]));

                    const toAdd = draftTables.filter(t => !originalMap.has(t.id) || t.id.startsWith('temp-'));
                    const toRemove = originalTables.filter(t => !draftMap.has(t.id) && !t.id.startsWith('temp-'));
                    const toUpdate = draftTables.filter(t => {
                        const original = originalMap.get(t.id);
                        if (!original || t.id.startsWith('temp-')) return false;
                        return (
                            t.x !== original.x ||
                            t.y !== original.y ||
                            t.rotation !== original.rotation ||
                            t.name !== original.name
                        );
                    });

                    const promises: Promise<any>[] = [];
                    const tempIdToRealIdMap = new Map<string, string>();

                    // Add new tables
                    for (const table of toAdd) {
                        const shapeDef = TABLE_SHAPES[table.shape_id];
                        if (!shapeDef) continue;

                        const isTemp = table.id.startsWith('temp-');

                        const result = await AddTableAction(floorPlanId, {
                            shape_id: table.shape_id,
                            category: table.category,
                            x: table.x,
                            y: table.y,
                            rotation: table.rotation,
                            capacity: table.capacity,
                            width: table.width,
                            height: table.height,
                            name: table.name,
                        });

                        if (isTemp && result?.objectId) {
                            tempIdToRealIdMap.set(table.id, result.objectId);
                        }
                    }

                    // Remove deleted tables
                    for (const table of toRemove) {
                        if (!table.id.startsWith('temp-')) {
                            promises.push(RemoveTableAction(table.id));
                        }
                    }

                    // Batch update positions/rotations
                    const positionUpdates = toUpdate
                        .filter(t => {
                            const original = originalMap.get(t.id);
                            return original && (t.x !== original.x || t.y !== original.y || t.rotation !== original.rotation);
                        })
                        .map(t => ({
                            id: t.id,
                            x: t.x,
                            y: t.y,
                            rotation: t.rotation,
                        }));

                    if (positionUpdates.length > 0) {
                        promises.push(UpdateTablePositionsBatchAction(positionUpdates));
                    }

                    // Update names individually
                    for (const table of toUpdate) {
                        const original = originalMap.get(table.id);
                        if (original && table.name !== original.name) {
                            promises.push(UpdateTableNameAction(table.id, table.name));
                        }
                    }

                    await Promise.all(promises);

                    // Replace temp IDs with real IDs in draft
                    if (tempIdToRealIdMap.size > 0) {
                        set(state => ({
                            draftTables: state.draftTables.map(t => {
                                const realId = tempIdToRealIdMap.get(t.id);
                                return realId ? { ...t, id: realId } : t;
                            })
                        }));
                    }

                    // Reload floor plans to get fresh data with real IDs
                    const locationId = get().locationId;
                    if (locationId) {
                        const floorPlans = await InitializeFloorPlan(locationId);
                        const updatedFloorPlan = floorPlans?.find(fp => fp.id === floorPlanId);

                        if (updatedFloorPlan?.objects) {
                            // Update draft and original with fresh data from database
                            set({
                                draftTables: updatedFloorPlan.objects.map(t => ({ ...t })),
                                originalTables: updatedFloorPlan.objects.map(t => ({ ...t })),
                                past: [],
                                future: [],
                                lastDraftSavedAt: new Date()
                            });
                        } else {
                            // Fallback: use current draft with real IDs
                            const updatedDraft = get().draftTables;
                            set({
                                originalTables: updatedDraft.map(t => ({ ...t })),
                                draftTables: updatedDraft.map(t => ({ ...t })),
                                past: [],
                                future: [],
                                lastDraftSavedAt: new Date()
                            });
                        }
                    }
                },

                hasUnsavedChanges: () => {
                    const draft = get().draftTables;
                    const original = get().originalTables;

                    if (draft.length !== original.length) return true;

                    const originalMap = new Map(original.map(t => [t.id, t]));
                    const draftMap = new Map(draft.map(t => [t.id, t]));

                    // Check for additions or deletions
                    for (const table of draft) {
                        if (!originalMap.has(table.id)) return true;
                    }

                    for (const table of original) {
                        if (!draftMap.has(table.id) && !table.id.startsWith('temp-')) return true;
                    }

                    // Check for updates
                    for (const table of draft) {
                        const originalTable = originalMap.get(table.id);
                        if (!originalTable) continue;

                        if (
                            table.x !== originalTable.x ||
                            table.y !== originalTable.y ||
                            table.rotation !== originalTable.rotation ||
                            table.name !== originalTable.name
                        ) {
                            return true;
                        }
                    }

                    return false;
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
                    const draftTables = get().draftTables;
                    const snapshot = draftTables.map(t => ({ ...t })); // Deep clone

                    set(state => ({
                        past: [...state.past.slice(-19), snapshot], // Keep last 20
                        future: []
                    }));
                },

                undo: () => {
                    set(state => {
                        if (state.past.length === 0) return state;

                        const previous = state.past[state.past.length - 1];
                        const current = state.draftTables.map(t => ({ ...t })); // Deep clone

                        return {
                            draftTables: previous.map(t => ({ ...t })), // Deep clone
                            past: state.past.slice(0, -1),
                            future: [current, ...state.future]
                        };
                    });
                },

                redo: () => {
                    set(state => {
                        if (state.future.length === 0) return state;

                        const next = state.future[0];
                        const current = state.draftTables.map(t => ({ ...t })); // Deep clone

                        return {
                            draftTables: next.map(t => ({ ...t })), // Deep clone
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
                    // Persist essential data and draft state
                    activeFloorPlanId: state.activeFloorPlanId,
                    isDesignMode: state.isDesignMode,
                    draftTables: state.draftTables,
                    originalTables: state.originalTables,
                    lastDraftSavedAt: state.lastDraftSavedAt,
                    past: state.past,
                    future: state.future
                })
            }
        )
    )
);

