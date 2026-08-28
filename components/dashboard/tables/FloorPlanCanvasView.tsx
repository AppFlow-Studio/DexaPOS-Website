'use client'
import { Input } from '@/components/ui/input'
import React, { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { FloorPlanEditorSidebar } from './FloorPlanToolbar'
import { RuntimeFloorPlanView } from './RuntimeFloorPlanView'
import { FloorPlanPropertiesPanel } from './FloorPlanPropertiesPanel'
import { QuickTableSetupDialog } from './QuickTableSetupDialog'
import { TableShapePickerDialog } from './TableShapePickerDialog'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Save, Undo2, Undo, Redo, Plus, Pencil, Trash2, Star, Settings2, LayoutGrid } from 'lucide-react'
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
import { getNextAvailableTableNumber } from '@/utils/tables/floor-plan-helpers'
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
        addTablesToDraft,
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

    const [mobilePanel, setMobilePanel] = useState<'canvas' | 'library' | 'properties'>('canvas')
    const [isSaving, setIsSaving] = useState(false)
    const [hasInitialized, setHasInitialized] = useState(false)
    const [lastActiveFloorPlanId, setLastActiveFloorPlanId] = useState<string | null>(null)
    const [tableToDelete, setTableToDelete] = useState<string | null>(null)
    const [isShiftPressed, setIsShiftPressed] = useState(false)
    const [isCtrlPressed, setIsCtrlPressed] = useState(false)

    // Floor Plan Management Dialog
    const [showManageDialog, setShowManageDialog] = useState(false)
    const [showShapePickerDialog, setShowShapePickerDialog] = useState(false)
    const [showQuickSetupDialog, setShowQuickSetupDialog] = useState(false)
    const [newPlanName, setNewPlanName] = useState('')
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
    const [editingPlanName, setEditingPlanName] = useState('')
    const [planToDelete, setPlanToDelete] = useState<string | null>(null)
    const [isManaging, setIsManaging] = useState(false)

    // Canvas Size
    const [canvasWidth, setCanvasWidth] = useState<string>('')
    const [canvasHeight, setCanvasHeight] = useState<string>('')

    const getObjectDescriptor = useCallback((object?: FloorPlanObject | null) => {
        if (!object) return 'object'
        if (object.category === 'table') return 'table'
        if (object.category === 'booth') return 'booth'

        const shapeLabel = TABLE_SHAPES[object.shape_id]?.label?.trim()
        return shapeLabel ? shapeLabel.toLowerCase() : 'object'
    }, [])

    const getSelectionDescriptor = useCallback((objectIds: string[]) => {
        const selectedObjects = objectIds
            .map((id) => draftTables.find((table) => table.id === id))
            .filter((table): table is FloorPlanObject => Boolean(table))

        if (selectedObjects.length === 0) return 'objects'

        const descriptors = new Set(selectedObjects.map((object) => getObjectDescriptor(object)))
        if (descriptors.size === 1) {
            const [descriptor] = Array.from(descriptors)
            return selectedObjects.length === 1 ? descriptor : `${descriptor}s`
        }

        return 'objects'
    }, [draftTables, getObjectDescriptor])

    const buildUniqueName = useCallback((baseName: string, usedNames: Set<string>) => {
        let index = 1
        let candidate = `${baseName} ${index}`

        while (usedNames.has(candidate.toLowerCase())) {
            index += 1
            candidate = `${baseName} ${index}`
        }

        usedNames.add(candidate.toLowerCase())
        return candidate
    }, [])

    const buildAutoPlacements = useCallback((
        items: Array<{
            shapeId: keyof typeof TABLE_SHAPES
            name?: string
        }>
    ) => {
        const canvasMaxWidth = activeFloorPlan?.canvas_width || 1200
        const margin = 80
        const gapX = 40
        const gapY = 48
        const visibleObjects = draftTables.filter((table) => table.is_visible !== false && table.is_active)
        const usedNames = new Set(
            draftTables
                .map((table) => table.name?.trim().toLowerCase())
                .filter((name): name is string => Boolean(name))
        )
        const reservedTableNames = draftTables.map((table) => table.name)

        let cursorX = margin
        let cursorY = margin
        let rowHeight = 0

        if (visibleObjects.length > 0) {
            const lowestEdge = visibleObjects.reduce((maxEdge, table) => {
                const shape = TABLE_SHAPES[table.shape_id]
                const tableHeight = table.height || shape?.height || 100
                return Math.max(maxEdge, table.y + tableHeight)
            }, 0)

            cursorY = lowestEdge + gapY
        }

        return items.map((item) => {
            const shape = TABLE_SHAPES[item.shapeId]
            const width = shape.width || 100
            const height = shape.height || 100

            if (cursorX > margin && cursorX + width > canvasMaxWidth - margin) {
                cursorX = margin
                cursorY += rowHeight + gapY
                rowHeight = 0
            }

            const explicitName = item.name?.trim()
            const resolvedName = (() => {
                if (explicitName) {
                    return usedNames.has(explicitName.toLowerCase())
                        ? buildUniqueName(explicitName, usedNames)
                        : (() => {
                            usedNames.add(explicitName.toLowerCase())
                            return explicitName
                        })()
                }

                if (shape.type === 'table') {
                    const nextName = String(getNextAvailableTableNumber(reservedTableNames))
                    reservedTableNames.push(nextName)
                    usedNames.add(nextName.toLowerCase())
                    return nextName
                }

                return usedNames.has(shape.label.toLowerCase())
                    ? buildUniqueName(shape.label, usedNames)
                    : (() => {
                        usedNames.add(shape.label.toLowerCase())
                        return shape.label
                    })()
            })()

            const placement = {
                shape_id: item.shapeId,
                category: shape.category as FloorPlanObject['category'],
                name: resolvedName,
                x: cursorX,
                y: cursorY,
                width: shape.width,
                height: shape.height,
                rotation: 0,
                capacity: shape.capacity,
                z_index: 1,
                is_active: true,
                is_visible: true,
            } satisfies Partial<FloorPlanObject>

            cursorX += width + gapX
            rowHeight = Math.max(rowHeight, height)

            return placement
        })
    }, [activeFloorPlan?.canvas_width, buildUniqueName, draftTables])

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
            // Refetch React Query cache
            await queryClient.refetchQueries({
                queryKey: ['floor-plans', locationId]
            })
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
                // Delete selected objects
                if (selectedTableIds.length > 0) {
                    e.preventDefault()
                    if (selectedTableIds.length === 1) {
                        setTableToDelete(selectedTableIds[0])
                    } else {
                        const selectionDescriptor = getSelectionDescriptor(selectedTableIds)
                        const confirmed = window.confirm(
                            `Are you sure you want to delete ${selectedTableIds.length} ${selectionDescriptor}? This action can be undone.`
                        )
                        if (confirmed) {
                            selectedTableIds.forEach((tableId) => {
                                removeTableFromDraft(tableId)
                            })
                            clearSelection()
                            toast.success(`${selectedTableIds.length} ${selectionDescriptor} deleted`)
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
    }, [clearSelection, getSelectionDescriptor, handleRedo, handleUndo, removeTableFromDraft, selectedTableIds])

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
                name: shapeDef.type === 'table'
                    ? String(getNextAvailableTableNumber(draftTables.map((table) => table.name)))
                    : `New ${shapeDef.label}`,
                capacity: shapeDef.capacity,
                z_index: 1,
                is_active: true,
                is_visible: true,
            })
        },
        [activeFloorPlan, addTableToDraft, draftTables]
    )

    const handleAddShapeFromLibrary = useCallback((shapeId: keyof typeof TABLE_SHAPES) => {
        const [placement] = buildAutoPlacements([{ shapeId }])
        if (!placement) return
        addTableToDraft(placement)
        toast.success(`${TABLE_SHAPES[shapeId].label} added to the draft`)
    }, [addTableToDraft, buildAutoPlacements])

    const handleAddShapeFromDialog = useCallback((payload: {
        shapeId: keyof typeof TABLE_SHAPES
        name?: string
    }) => {
        const [placement] = buildAutoPlacements([{ shapeId: payload.shapeId, name: payload.name }])
        if (!placement) return
        addTableToDraft(placement)
        toast.success(`${placement.name} added to the draft`)
    }, [addTableToDraft, buildAutoPlacements])

    const handleQuickSetupApply = useCallback((items: Array<{ shapeId: keyof typeof TABLE_SHAPES; quantity: number }>) => {
        const placements = buildAutoPlacements(
            items.flatMap((item) =>
                Array.from({ length: item.quantity }, () => ({
                    shapeId: item.shapeId,
                }))
            )
        )

        if (placements.length === 0) return

        addTablesToDraft(placements)
        toast.success(`${placements.length} objects added to the draft`)
    }, [addTablesToDraft, buildAutoPlacements])

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
    const objectToDelete = tableToDelete
        ? draftTables.find((table) => table.id === tableToDelete) || null
        : null
    const objectDescriptor = getObjectDescriptor(objectToDelete)
    const dialogTitleDescriptor = objectDescriptor === 'object'
        ? 'Object'
        : objectDescriptor.replace(/\b\w/g, (char) => char.toUpperCase())

    return (
        <div className="tables-pill-controls flex h-[90vh] max-h-screen flex-col overflow-hidden rounded-3xl border bg-card">
            {/* Top Bar - Edit Mode Specific */}
            <header className="min-h-12 border-b bg-background px-3 flex items-center justify-between gap-2 shrink-0 z-10 flex-wrap py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 shrink-0">
                        <Undo2 className="w-4 h-4 mr-1" />
                        <span className="hidden sm:inline">Cancel</span>
                    </Button>
                    <span className="text-xs font-semibold text-muted-foreground hidden sm:inline shrink-0">Editing:</span>
                    {availableFloorPlans && availableFloorPlans.length > 0 && (
                        <Select
                            value={effectiveActiveFloorPlanId || ''}
                            onValueChange={handleFloorPlanChange}
                        >
                            <SelectTrigger className="w-[140px] sm:w-[220px] h-8 text-xs">
                                <SelectValue placeholder="Select floor plan" />
                            </SelectTrigger>
                            {/* Portalled out of `.tables-pill-controls`, so the
                                overlay radius is set here (§3.1 tier 2). */}
                            <SelectContent className="rounded-2xl p-1.5">
                                {availableFloorPlans.map((fp) => (
                                    <SelectItem
                                        key={fp.id}
                                        value={fp.id}
                                        className="rounded-full py-1.5 pl-3"
                                    >
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
                        <span className="text-xs font-semibold text-slate-900 truncate">{activeFloorPlan.name}</span>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setShowManageDialog(true)} className="h-8 px-2 shrink-0">
                        <Settings2 className="w-3.5 h-3.5 sm:mr-1" />
                        <span className="hidden sm:inline text-xs">Manage</span>
                    </Button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title="Undo (Ctrl/Cmd+Z)"
                        className="h-8 px-2"
                    >
                        <Undo className="w-3.5 h-3.5 sm:mr-1" />
                        <span className="hidden sm:inline text-xs">Undo</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title="Redo (Ctrl/Cmd+Shift+Z)"
                        className="h-8 px-2"
                    >
                        <Redo className="w-3.5 h-3.5 sm:mr-1" />
                        <span className="hidden sm:inline text-xs">Redo</span>
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className="bg-blue-600 hover:bg-blue-700 h-8 px-2 sm:px-3"
                    >
                        <Save className="w-3.5 h-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline text-xs">{isSaving ? 'Saving...' : 'Save'}</span>
                    </Button>
                </div>
            </header>

            {/* Mobile panel switcher tabs */}
            <div className="lg:hidden flex border-b bg-background shrink-0">
                {([
                    { id: 'library', label: 'Library' },
                    { id: 'canvas', label: 'Canvas' },
                    { id: 'properties', label: 'Properties' },
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setMobilePanel(tab.id)}
                        className={cn(
                            'flex-1 py-2 text-xs font-medium border-b-2 transition-colors',
                            mobilePanel === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex overflow-hidden relative h-full">
                {/* 1. LEFT SIDEBAR (Shape Library) */}
                <div className={cn('h-full shrink-0', mobilePanel === 'library' ? 'block w-full' : 'hidden lg:block')}>
                    <FloorPlanEditorSidebar
                        onAddShape={handleAddShapeFromLibrary}
                        onOpenShapePicker={() => setShowShapePickerDialog(true)}
                        onOpenQuickSetup={() => setShowQuickSetupDialog(true)}
                    />
                </div>

                {/* 2. MAIN CANVAS */}
                <div className={cn('relative h-full bg-slate-900', mobilePanel === 'canvas' ? 'flex-1 block' : 'hidden lg:flex lg:flex-1')}>
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
                <div className={cn('h-full shrink-0', mobilePanel === 'properties' ? 'block w-full' : 'hidden lg:block')}>
                    <FloorPlanPropertiesPanel
                        selectedTableId={selectedTableId || null}
                        draftTables={draftTables}
                        onClose={clearSelection}
                    />
                </div>
            </div>

            <TableShapePickerDialog
                open={showShapePickerDialog}
                onOpenChange={setShowShapePickerDialog}
                onAdd={handleAddShapeFromDialog}
            />

            <QuickTableSetupDialog
                open={showQuickSetupDialog}
                onOpenChange={setShowQuickSetupDialog}
                onApply={handleQuickSetupApply}
            />

            {/* Manage Floor Plans Dialog */}
            <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
                {/* Mobile: a bottom sheet with a rounded top. Unlike the other
                    two this has no flex/scroll wrapper of its own, so it takes
                    overflow-y-auto to stay scrollable inside the 92dvh cap. */}
                <DialogContent className="tables-pill-controls sm:max-w-lg sm:rounded-3xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:rounded-t-[28px]">
                    <DialogHeader>
                        <DialogTitle>Manage Floor Plans</DialogTitle>
                        <DialogDescription>Create, rename, or delete floor plans for this location.</DialogDescription>
                    </DialogHeader>

                    {/* Existing Plans List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {(availableFloorPlans || []).map((fp) => (
                            <div key={fp.id} className="flex items-center gap-2 rounded-2xl border-0 p-2 bg-muted/50 shadow-none">
                                {editingPlanId === fp.id ? (
                                    <>
                                        <Input
                                            value={editingPlanName}
                                            onChange={(e) => setEditingPlanName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleRenamePlan()}
                                            autoFocus
                                            className="h-7 text-sm flex-1 rounded-xl border-transparent bg-background"
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
                    <div className="pt-3 space-y-2">
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
                    <div className="pt-3 space-y-2">
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
                        <DialogTitle>Delete {dialogTitleDescriptor}</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this {objectDescriptor}? This action can be undone using the Undo button.
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
