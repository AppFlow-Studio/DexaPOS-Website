'use client'
import { Input } from '@/components/ui/input'
import React, { useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FloorPlanEditorSidebar } from './FloorPlanToolbar'
import { RuntimeFloorPlanView } from './RuntimeFloorPlanView'
import { FloorPlanPropertiesPanel } from './FloorPlanPropertiesPanel'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Save, Undo2, Undo, Redo, Plus, Pencil, Trash2, Star, Settings2 } from 'lucide-react'
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
import { CreateFloorPlanAction, UpdateFloorPlanAction, DeleteFloorPlanAction } from '@/app/dashboard/actions/floor-plan-actions'

interface FloorPlanCanvasViewProps {
    locationId: string
    initialFloorPlanId?: string | null
    onBack: () => void
    refetchFloorPlanStatus: () => void
}

export function FloorPlanCanvasView({ locationId, initialFloorPlanId, onBack, refetchFloorPlanStatus }: FloorPlanCanvasViewProps) {
    const queryClient = useQueryClient()
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
        updateTableSizeInDraft,
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

    // Set store locationId to ensure create/update operations work with correct location
    useEffect(() => {
        useFloorPlanStore.setState({ locationId })
    }, [locationId])

    // Use floor plans from React Query (most up-to-date) or fallback to store
    const availableFloorPlans = floorPlans || storeFloorPlans

    // Determine active floor plan: use store's activeFloorPlanId if set, otherwise default
    const effectiveActiveFloorPlanId = activeFloorPlanId ||
        availableFloorPlans?.find((fp) => fp.is_default)?.id ||
        availableFloorPlans?.[0]?.id

    const activeFloorPlan = availableFloorPlans?.find((fp) => fp.id === effectiveActiveFloorPlanId) ||
        availableFloorPlans?.find((fp) => fp.is_default) ||
        availableFloorPlans?.[0]

    // Set initial floor plan if provided (force set, overrides localStorage)
    useEffect(() => {
        if (initialFloorPlanId && availableFloorPlans?.length) {
            const floorPlanExists = availableFloorPlans.some(fp => fp.id === initialFloorPlanId)
            if (floorPlanExists) {
                console.log('[FloorPlanCanvasView] Setting initial floor plan:', initialFloorPlanId)
                setActiveFloorPlan(initialFloorPlanId).catch(console.error)
            }
        }
    }, [initialFloorPlanId, availableFloorPlans, setActiveFloorPlan])

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
    const [isShiftPressed, setIsShiftPressed] = useState(false)
    const [isCtrlPressed, setIsCtrlPressed] = useState(false)

    // Floor Plan Management Dialog
    const [showManageDialog, setShowManageDialog] = useState(false)
    const [newPlanName, setNewPlanName] = useState('')
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
    const [editingPlanName, setEditingPlanName] = useState('')
    const [planToDelete, setPlanToDelete] = useState<string | null>(null)
    const [isManaging, setIsManaging] = useState(false)

    // Canvas Size
    const [canvasWidth, setCanvasWidth] = useState<string>('')
    const [canvasHeight, setCanvasHeight] = useState<string>('')

    // Sync canvas size inputs when active floor plan changes
    useEffect(() => {
        if (activeFloorPlan) {
            setCanvasWidth(String(activeFloorPlan.canvas_width ?? 1200))
            setCanvasHeight(String(activeFloorPlan.canvas_height ?? 800))
        }
    }, [activeFloorPlan?.id])

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

    const handleCreatePlan = async () => {
        if (!newPlanName.trim()) return
        setIsManaging(true)
        try {
            console.log('[handleCreatePlan] Creating floor plan:', newPlanName.trim(), 'locationId:', locationId)
            const result = await CreateFloorPlanAction(locationId, newPlanName.trim())
            const id = result.floorPlanId
            console.log('[handleCreatePlan] Created with ID:', id)
            setNewPlanName('')
            // Update store with new floor plans
            useFloorPlanStore.setState({ floorPlans: result.floorPlans })
            await handleFloorPlanChange(id)
            toast.success(`Floor plan "${newPlanName.trim()}" created`)
        } catch (e: any) {
            console.error('[handleCreatePlan] Error:', e)
            console.error('[handleCreatePlan] Error string:', JSON.stringify(e))
            console.error('[handleCreatePlan] Error message:', e?.message)
            console.error('[handleCreatePlan] Error details:', e?.details)
            console.error('[handleCreatePlan] Error hint:', e?.hint)
            const errorMsg = e?.message || JSON.stringify(e) || 'Unknown error'
            toast.error(`Failed to create floor plan: ${errorMsg}`)
        } finally {
            setIsManaging(false)
        }
    }

    const handleRenamePlan = async () => {
        if (!editingPlanId || !editingPlanName.trim()) return
        setIsManaging(true)
        try {
            await UpdateFloorPlanAction(editingPlanId, { name: editingPlanName.trim() })
            await new Promise(r => setTimeout(r, 100))
            await queryClient.refetchQueries({
                queryKey: ['floor-plans', locationId]
            })
            setEditingPlanId(null)
            setEditingPlanName('')
            toast.success('Floor plan renamed')
        } catch (e) {
            toast.error('Failed to rename floor plan')
        } finally {
            setIsManaging(false)
        }
    }

    const handleSetDefault = async (floorPlanId: string) => {
        setIsManaging(true)
        try {
            await UpdateFloorPlanAction(floorPlanId, { is_default: true })
            await new Promise(r => setTimeout(r, 100))
            await queryClient.refetchQueries({
                queryKey: ['floor-plans', locationId]
            })
            toast.success('Default floor plan updated')
        } catch (e) {
            toast.error('Failed to set default')
        } finally {
            setIsManaging(false)
        }
    }

    const handleSaveCanvasSize = async () => {
        const planIdToUpdate = effectiveActiveFloorPlanId || activeFloorPlan?.id
        if (!planIdToUpdate) {
            toast.error('No floor plan selected')
            return
        }
        const w = parseInt(canvasWidth)
        const h = parseInt(canvasHeight)
        if (!w || !h || w < 100 || h < 100) {
            toast.error('Canvas size must be at least 100×100')
            return
        }
        setIsManaging(true)
        try {
            console.log('[handleSaveCanvasSize] Updating floor plan', planIdToUpdate, { canvas_width: w, canvas_height: h })
            await UpdateFloorPlanAction(planIdToUpdate, { canvas_width: w, canvas_height: h })
            // Wait a moment for store to update, then refetch React Query
            await new Promise(r => setTimeout(r, 100))
            await queryClient.refetchQueries({
                queryKey: ['floor-plans', locationId]
            })
            toast.success('Canvas size updated')
        } catch (e) {
            console.error('[handleSaveCanvasSize] Error:', e)
            toast.error('Failed to update canvas size')
        } finally {
            setIsManaging(false)
        }
    }

    const handleDeletePlan = async () => {
        if (!planToDelete) return
        setIsManaging(true)
        try {
            await DeleteFloorPlanAction(planToDelete)
            await new Promise(r => setTimeout(r, 100))
            await queryClient.refetchQueries({
                queryKey: ['floor-plans', locationId]
            })
            setPlanToDelete(null)
            toast.success('Floor plan deleted')
        } catch (e: any) {
            toast.error(e?.message || 'Failed to delete floor plan')
        } finally {
            setIsManaging(false)
        }
    }

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

    // Track shift/ctrl key state for multi-select
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Update shift/ctrl state
            setIsShiftPressed(e.shiftKey)
            setIsCtrlPressed(e.ctrlKey || e.metaKey)

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

        const handleKeyUp = (e: KeyboardEvent) => {
            setIsShiftPressed(e.shiftKey)
            setIsCtrlPressed(e.ctrlKey || e.metaKey)
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
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

    const handleUpdateSize = useCallback(
        (id: string, width: number, height: number) => {
            // Update in draft (local-only, no DB call)
            updateTableSizeInDraft(id, width, height)
        },
        [updateTableSizeInDraft]
    )

    const handleBatchUpdatePositions = useCallback(
        (updates: Array<{ id: string; x: number; y: number }>) => {
            // Update all tables in batch
            updates.forEach(({ id, x, y }) => {
                updateTablePositionInDraft(id, x, y)
            })
        },
        [updateTablePositionInDraft]
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

    const handleTableClick = useCallback((tableId: string, e?: React.MouseEvent<HTMLDivElement>) => {
        // Check event keys directly for immediate responsiveness (not relying on state)
        const isShift = (e && e.shiftKey) || isShiftPressed
        const isCtrl = (e && (e.ctrlKey || e.metaKey)) || isCtrlPressed

        if (isShift) {
            // Shift+Click: toggle this table's selection without affecting others
            toggleTableSelection(tableId)
        } else if (isCtrl) {
            // Ctrl/Cmd+Click: add/remove from selection
            toggleTableSelection(tableId)
        } else {
            // Regular click: select only this table
            clearSelection()
            toggleTableSelection(tableId)
        }
    }, [toggleTableSelection, isShiftPressed, isCtrlPressed, clearSelection])

    const handleSave = useCallback(async () => {
        if (!activeFloorPlan || !hasChanges) return

        setIsSaving(true)

        try {
            // Save draft to database (batches all changes)
            await saveDraftToDatabase()

            // Invalidate the floor plans query so next load refetches fresh data
            await queryClient.invalidateQueries({
                queryKey: ['floor-plans', locationId]
            })

            // Clear any selection before exiting
            clearSelection()

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
    }, [activeFloorPlan, hasChanges, saveDraftToDatabase, onBack, queryClient, locationId])

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
                    <Button variant="outline" size="sm" onClick={() => setShowManageDialog(true)}>
                        <Settings2 className="w-4 h-4 mr-1" />
                        Manage
                    </Button>
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
                        selectedTableIds={selectedTableIds}
                        isDesignMode={true}
                        onTableClick={handleTableClick}
                        onClearSelection={clearSelection}
                        onUpdateTablePosition={handleUpdatePosition}
                        onBatchUpdateTablePositions={handleBatchUpdatePositions}
                        onUpdateTableName={handleUpdateName}
                        onUpdateTableSize={handleUpdateSize}
                        onUpdateTableRotation={handleUpdateRotation}
                        onRotateEnd={handleRotateEnd}
                        onRemoveTable={handleRemoveTable}
                        onCanvasDrop={handleAddShape}
                        onTableDragStart={handleDragStart}
                        onTableDragEnd={handleDragEnd}
                    />
                </div>

                {/* 3. RIGHT SIDEBAR (Properties Panel) */}
                <FloorPlanPropertiesPanel
                    selectedTableId={selectedTableId || null}
                    draftTables={draftTables}
                    onClose={clearSelection}
                />
            </div>

            {/* Manage Floor Plans Dialog */}
            <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Manage Floor Plans</DialogTitle>
                        <DialogDescription>Create, rename, or delete floor plans for this location.</DialogDescription>
                    </DialogHeader>

                    {/* Existing Plans List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {(availableFloorPlans || []).map((fp) => (
                            <div key={fp.id} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                                {editingPlanId === fp.id ? (
                                    <>
                                        <Input
                                            value={editingPlanName}
                                            onChange={(e) => setEditingPlanName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleRenamePlan()}
                                            autoFocus
                                            className="h-7 text-sm flex-1"
                                        />
                                        <Button size="sm" onClick={handleRenamePlan} disabled={isManaging}>Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingPlanId(null)}>Cancel</Button>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex-1 text-sm font-medium">{fp.name}</span>
                                        {fp.is_default && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Default</span>
                                        )}
                                        {!fp.is_default && (
                                            <Button
                                                size="icon" variant="ghost"
                                                className="h-7 w-7"
                                                title="Set as default"
                                                onClick={() => handleSetDefault(fp.id)}
                                                disabled={isManaging}
                                            >
                                                <Star className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                        <Button
                                            size="icon" variant="ghost"
                                            className="h-7 w-7"
                                            title="Rename"
                                            onClick={() => { setEditingPlanId(fp.id); setEditingPlanName(fp.name) }}
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button
                                            size="icon" variant="ghost"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            title={fp.is_default ? 'Cannot delete default' : 'Delete'}
                                            onClick={() => setPlanToDelete(fp.id)}
                                            disabled={fp.is_default || isManaging}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Delete confirmation inline */}
                    {planToDelete && (
                        <div className="rounded border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                            <p className="text-sm text-destructive font-medium">
                                Delete "{availableFloorPlans?.find(f => f.id === planToDelete)?.name}"? This cannot be undone.
                            </p>
                            <div className="flex gap-2">
                                <Button size="sm" variant="destructive" onClick={handleDeletePlan} disabled={isManaging}>
                                    {isManaging ? 'Deleting...' : 'Delete'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setPlanToDelete(null)}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    {/* Canvas Size */}
                    <div className="border-t pt-3 space-y-2">
                        <p className="text-sm font-medium">Canvas Size</p>
                        <p className="text-xs text-muted-foreground">Sets the visible working area for the active floor plan.</p>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 flex-1">
                                <span className="text-xs text-muted-foreground w-5">W</span>
                                <Input
                                    type="number"
                                    min={100}
                                    max={9999}
                                    value={canvasWidth}
                                    onChange={(e) => setCanvasWidth(e.target.value)}
                                    className="h-8 text-sm"
                                    placeholder="1200"
                                />
                            </div>
                            <span className="text-muted-foreground text-sm">×</span>
                            <div className="flex items-center gap-1.5 flex-1">
                                <span className="text-xs text-muted-foreground w-5">H</span>
                                <Input
                                    type="number"
                                    min={100}
                                    max={9999}
                                    value={canvasHeight}
                                    onChange={(e) => setCanvasHeight(e.target.value)}
                                    className="h-8 text-sm"
                                    placeholder="800"
                                />
                            </div>
                            <Button size="sm" onClick={handleSaveCanvasSize} disabled={isManaging} className="shrink-0">
                                Apply
                            </Button>
                        </div>
                    </div>

                    {/* Create New Plan */}
                    <div className="border-t pt-3 space-y-2">
                        <p className="text-sm font-medium">Create New Floor Plan</p>
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g., Patio, Bar, Dining Room"
                                value={newPlanName}
                                onChange={(e) => setNewPlanName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlan()}
                                className="flex-1"
                            />
                            <Button onClick={handleCreatePlan} disabled={!newPlanName.trim() || isManaging}>
                                <Plus className="w-4 h-4 mr-1" />
                                Create
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

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
