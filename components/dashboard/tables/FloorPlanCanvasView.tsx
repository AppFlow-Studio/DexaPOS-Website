'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { FloorPlanEditorSidebar } from './FloorPlanToolbar'
import { RuntimeFloorPlanView } from './RuntimeFloorPlanView'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Save, Undo2, Undo, Redo } from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useFloorPlans } from '@/app/dashboard/hooks/useFloorPlan'
import { useFloorPlanStore } from '@/stores/floor-plan-store'
import { FloorPlanObject } from '@/types/floor-plan'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'

interface FloorPlanCanvasViewProps {
    locationId: string
    onBack: () => void
    refetchFloorPlanStatus: () => void
}

export function FloorPlanCanvasView({ locationId, onBack, refetchFloorPlanStatus }: FloorPlanCanvasViewProps) {
    const { data: floorPlans } = useFloorPlans(locationId)

    // Zustand Store
    const {
        floorPlans: storeFloorPlans,
        activeFloorPlanId,
        draftTables,
        past,
        future,
        selectedTableIds,
        initializeDraft,
        addTableToDraft,
        updateTablePositionInDraft,
        updateTableRotationInDraft,
        updateTableNameInDraft,
        removeTableFromDraft,
        saveSnapshot,
        undo,
        redo,
        saveDraftToDatabase,
        hasUnsavedChanges,
        toggleTableSelection,
        clearSelection,
        setActiveFloorPlan,
    } = useFloorPlanStore()

    // Use floor plans from React Query (most up-to-date) or fallback to store
    const availableFloorPlans = floorPlans || storeFloorPlans

    // Determine active floor plan: use store's activeFloorPlanId if set, otherwise default
    const effectiveActiveFloorPlanId = activeFloorPlanId ||
        availableFloorPlans?.find((fp) => fp.is_default)?.id ||
        availableFloorPlans?.[0]?.id

    const activeFloorPlan = availableFloorPlans?.find((fp) => fp.id === effectiveActiveFloorPlanId) ||
        availableFloorPlans?.find((fp) => fp.is_default) ||
        availableFloorPlans?.[0]

    // Sync store's activeFloorPlanId if it's not set but we have floor plans
    useEffect(() => {
        if (availableFloorPlans && availableFloorPlans.length > 0 && !activeFloorPlanId && effectiveActiveFloorPlanId) {
            setActiveFloorPlan(effectiveActiveFloorPlanId).catch(console.error)
        }
    }, [availableFloorPlans, activeFloorPlanId, effectiveActiveFloorPlanId, setActiveFloorPlan])

    const [isSaving, setIsSaving] = useState(false)
    const [hasInitialized, setHasInitialized] = useState(false)
    const [lastActiveFloorPlanId, setLastActiveFloorPlanId] = useState<string | null>(null)
    const [tableToDelete, setTableToDelete] = useState<string | null>(null)

    // Get unsaved changes state from store
    const hasChanges = hasUnsavedChanges()

    // Handle floor plan selection change
    const handleFloorPlanChange = useCallback(
        async (floorPlanId: string) => {
            // Check if there are unsaved changes
            if (hasChanges) {
                const confirmed = window.confirm(
                    'You have unsaved changes. Do you want to discard them and switch to another floor plan?'
                )
                if (!confirmed) return
            }

            try {
                // Set active floor plan in store
                await setActiveFloorPlan(floorPlanId)

                // Reset initialization flag to allow re-initialization
                setHasInitialized(false)
                setLastActiveFloorPlanId(floorPlanId)
            } catch (error) {
                console.error('Error switching floor plan:', error)
                toast.error('Failed to switch floor plan')
            }
        },
        [setActiveFloorPlan, hasChanges]
    )

    // Initialize draft when floor plan loads or changes
    useEffect(() => {
        if (activeFloorPlan?.objects && (activeFloorPlan.id !== lastActiveFloorPlanId || !hasInitialized)) {
            const tables = activeFloorPlan.objects || []
            initializeDraft(tables)
            setHasInitialized(true)
            setLastActiveFloorPlanId(activeFloorPlan.id)
        }
    }, [activeFloorPlan?.id, activeFloorPlan?.objects, initializeDraft, hasInitialized, lastActiveFloorPlanId])

    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
        undo()
    }, [undo])

    const handleRedo = useCallback(() => {
        redo()
    }, [redo])

    // Keyboard shortcuts for undo/redo and delete
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Prevent deletion if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return
            }

            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                handleUndo()
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault()
                handleRedo()
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                // Delete selected tables
                if (selectedTableIds.length > 0) {
                    e.preventDefault()
                    // Show confirmation for first table, or delete all if confirmed
                    if (selectedTableIds.length === 1) {
                        setTableToDelete(selectedTableIds[0])
                    } else {
                        // For multiple tables, show confirmation
                        const confirmed = window.confirm(
                            `Are you sure you want to delete ${selectedTableIds.length} tables? This action can be undone.`
                        )
                        if (confirmed) {
                            // removeTableFromDraft already saves snapshots internally
                            selectedTableIds.forEach((tableId) => {
                                removeTableFromDraft(tableId)
                            })
                            clearSelection()
                            toast.success(`${selectedTableIds.length} tables deleted`)
                        }
                    }
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleUndo, handleRedo, selectedTableIds, removeTableFromDraft, clearSelection])

    // --- HANDLERS ---

    const handleAddShape = useCallback(
        (shapeId: string, x: number, y: number) => {
            if (!activeFloorPlan) return

            const shapeDef = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES]
            if (!shapeDef) return

            // Add to draft (local-only, no DB call)
            addTableToDraft({
                shape_id: shapeId as keyof typeof TABLE_SHAPES,
                category: shapeDef.category as FloorPlanObject['category'],
                x,
                y,
                width: shapeDef.width,
                height: shapeDef.height,
                rotation: 0,
                name: `New ${shapeDef.label}`,
                capacity: shapeDef.capacity,
                z_index: 1,
                is_active: true,
                is_visible: true,
            })
        },
        [activeFloorPlan, addTableToDraft]
    )

    const handleUpdatePosition = useCallback(
        (id: string, x: number, y: number) => {
            // Update in draft (local-only, no DB call)
            updateTablePositionInDraft(id, x, y)
        },
        [updateTablePositionInDraft]
    )

    const handleDragStart = useCallback(() => {
        // Save snapshot when drag starts (for undo/redo)
        // Only save if we don't have a recent snapshot to avoid too many snapshots
        saveSnapshot()
    }, [saveSnapshot])

    const handleDragEnd = useCallback(() => {
        // No DB call needed - position is already updated in draft
        // Just ensure snapshot was saved
    }, [])

    const handleUpdateName = useCallback(
        (id: string, name: string) => {
            // Update in draft (local-only, no DB call)
            updateTableNameInDraft(id, name)
        },
        [updateTableNameInDraft]
    )

    const handleUpdateRotation = useCallback(
        (id: string, rotation: number) => {
            // Update in draft (local-only, no DB call) - smooth 60fps updates
            updateTableRotationInDraft(id, rotation)
        },
        [updateTableRotationInDraft]
    )

    const handleRotateEnd = useCallback(
        (id: string, rotation: number) => {
            // Snapshot is already taken by handleDragStart
            // Rotation is already updated in draft, no DB call needed
        },
        []
    )

    const handleRemoveTable = useCallback(
        (id: string) => {
            // Show confirmation dialog
            setTableToDelete(id)
        },
        []
    )

    const confirmDeleteTable = useCallback(() => {
        if (!tableToDelete) return

        // removeTableFromDraft already saves a snapshot internally
        removeTableFromDraft(tableToDelete)
        setTableToDelete(null)
        toast.success('Table deleted')
    }, [tableToDelete, removeTableFromDraft])

    const cancelDeleteTable = useCallback(() => {
        setTableToDelete(null)
    }, [])

    const handleTableClick = useCallback((tableId: string) => {
        toggleTableSelection(tableId)
    }, [toggleTableSelection])

    const handleSave = useCallback(async () => {
        if (!activeFloorPlan || !hasChanges) return

        setIsSaving(true)

        try {
            // Save draft to database (batches all changes)
            await saveDraftToDatabase()
            refetchFloorPlanStatus()
            toast.success('Layout saved successfully')

            // Exit edit mode
            onBack()
        } catch (error) {
            console.error('Error saving:', error)
            toast.error('Failed to save layout')
        } finally {
            setIsSaving(false)
        }
    }, [activeFloorPlan, hasChanges, saveDraftToDatabase, onBack])

    if (!activeFloorPlan) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-muted-foreground">Loading floor plan...</div>
            </div>
        )
    }

    const canUndo = past.length > 0
    const canRedo = future.length > 0
    const selectedTableId = selectedTableIds[0]

    return (
        <div className="flex flex-col max-h-screen h-[90vh] bg-background shadow-xl rounded-lg overflow-hidden">
            {/* Top Bar - Edit Mode Specific */}
            <header className="h-14 border-b bg-background px-4 flex items-center justify-between shrink-0 z-10">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <Undo2 className="w-4 h-4 mr-2" />
                        Cancel
                    </Button>
                    <span className="text-sm font-semibold text-muted-foreground">Editing:</span>
                    {availableFloorPlans && availableFloorPlans.length > 0 && (
                        <Select
                            value={effectiveActiveFloorPlanId || ''}
                            onValueChange={handleFloorPlanChange}
                        >
                            <SelectTrigger className="w-[280px]">
                                <SelectValue placeholder="Select floor plan" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableFloorPlans.map((fp) => (
                                    <SelectItem key={fp.id} value={fp.id}>
                                        <div className="flex items-center justify-between w-full">
                                            <span>{fp.name}</span>
                                            <span className="text-xs text-foreground ml-2">
                                                {fp.is_default && '(Default)'}
                                                {fp.table_count !== undefined && ` • ${fp.table_count} tables`}
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {(!availableFloorPlans || availableFloorPlans.length === 0) && activeFloorPlan && (
                        <span className="text-sm font-semibold text-slate-900">{activeFloorPlan.name}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl/Cmd+Z)"
                    >
                        <Undo className="w-4 h-4 mr-2" />
                        Undo
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl/Cmd+Shift+Z)"
                    >
                        <Redo className="w-4 h-4 mr-2" />
                        Redo
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                        <Save className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </header>

            <div className="flex overflow-hidden relative h-full">
                {/* 1. LEFT SIDEBAR (Shape Library) */}
                <FloorPlanEditorSidebar />

                {/* 2. MAIN CANVAS (Reused Runtime Component) */}
                <div className="flex-1 relative h-full bg-[#e5e5e5]">
                    <RuntimeFloorPlanView
                        floorPlan={activeFloorPlan}
                        tables={draftTables}
                        selectedTableId={selectedTableId}
                        isDesignMode={true}
                        onTableClick={handleTableClick}
                        onUpdateTablePosition={handleUpdatePosition}
                        onUpdateTableName={handleUpdateName}
                        onUpdateTableRotation={handleUpdateRotation}
                        onRotateEnd={handleRotateEnd}
                        onRemoveTable={handleRemoveTable}
                        onCanvasDrop={handleAddShape}
                        onTableDragStart={handleDragStart}
                        onTableDragEnd={handleDragEnd}
                    />
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!tableToDelete} onOpenChange={(open) => !open && setTableToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Table</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this table? This action can be undone using the Undo button.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={cancelDeleteTable}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDeleteTable}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
