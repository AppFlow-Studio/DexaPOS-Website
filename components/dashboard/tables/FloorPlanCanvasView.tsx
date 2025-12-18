'use client'

import * as React from 'react'
import { useMemo } from 'react'
import {
    useFloorPlans,
    useCreateFloorPlanMutation,
    useAddTableMutation,
    useUpdateTablePositionMutation,
    useUpdateTablePositionsBatchMutation,
    useUpdateTableRotationMutation,
    useUpdateTableNameMutation,
    useRemoveTableMutation,
    useMergeTablesMutation,
    useUnmergeTablesMutation,
} from '@/app/dashboard/hooks/useFloorPlan'
import { FloorPlanToolbar } from './FloorPlanToolbar'
import { InteractiveCanvas } from './InteractiveCanvas'
import { TablePalette } from './TablePalette'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'
import { FloorPlanObject } from '@/types/floor-plan'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FloorPlanCanvasViewProps {
    locationId: string
    onBack: () => void
}

// Helper to sanitize tables for history (remove non-serializable data)
const sanitizeTables = (tables: FloorPlanObject[]): FloorPlanObject[] => {
    return tables.map((t) => ({
        id: t.id,
        floor_plan_id: t.floor_plan_id,
        name: t.name,
        shape_id: t.shape_id,
        category: t.category,
        x: t.x,
        y: t.y,
        rotation: t.rotation,
        width: t.width,
        height: t.height,
        capacity: t.capacity,
        min_capacity: t.min_capacity,
        is_reservable: t.is_reservable,
        is_combinable: t.is_combinable,
        default_turn_time: t.default_turn_time,
        section_id: t.section_id,
        zone_name: t.zone_name,
        label_override: t.label_override,
        color_override: t.color_override,
        z_index: t.z_index,
        is_visible: t.is_visible,
        is_active: t.is_active,
        mergedWith: t.mergedWith,
        isPrimary: t.isPrimary,
    }))
}

// Find next available position for a table (avoiding overlaps)
const findNextAvailablePosition = (
    existingTables: FloorPlanObject[],
    newTableDimensions: { width: number; height: number },
    gridSize: number,
    canvasWidth: number,
    canvasHeight: number,
    padding: number = 20
): { x: number; y: number } => {
    for (let y = gridSize; y < canvasHeight; y += gridSize) {
        for (let x = gridSize; x < canvasWidth; x += gridSize) {
            const candidateRect = {
                x,
                y,
                width: newTableDimensions.width + padding * 2,
                height: newTableDimensions.height + padding * 2,
            }

            let isOverlapping = false
            for (const table of existingTables) {
                if (!table.is_visible || !table.is_active) continue

                const shape = TABLE_SHAPES[table.shape_id]
                if (!shape) continue

                const existingWidth = table.width || shape.width || 100
                const existingHeight = table.height || shape.height || 100

                const existingRect = {
                    x: table.x - padding,
                    y: table.y - padding,
                    width: existingWidth + padding * 2,
                    height: existingHeight + padding * 2,
                }

                if (
                    candidateRect.x < existingRect.x + existingRect.width &&
                    candidateRect.x + candidateRect.width > existingRect.x &&
                    candidateRect.y < existingRect.y + existingRect.height &&
                    candidateRect.y + candidateRect.height > existingRect.y
                ) {
                    isOverlapping = true
                    break
                }
            }

            if (!isOverlapping) {
                return { x, y }
            }
        }
    }

    // Fallback to center if no position found
    return { x: canvasWidth / 2, y: canvasHeight / 2 }
}

export function FloorPlanCanvasView({ locationId, onBack }: FloorPlanCanvasViewProps) {
    // React Query hooks
    const { data: floorPlans = [], isLoading, error } = useFloorPlans(locationId)
    const createFloorPlanMutation = useCreateFloorPlanMutation(locationId)
    const addTableMutation = useAddTableMutation(locationId)
    const updateTablePositionMutation = useUpdateTablePositionMutation(locationId)
    const updateTablePositionsBatchMutation = useUpdateTablePositionsBatchMutation(locationId)
    const updateTableRotationMutation = useUpdateTableRotationMutation(locationId)
    const updateTableNameMutation = useUpdateTableNameMutation(locationId)
    const removeTableMutation = useRemoveTableMutation(locationId)
    const mergeTablesMutation = useMergeTablesMutation(locationId)
    const unmergeTablesMutation = useUnmergeTablesMutation(locationId)

    // Local state for design mode (for fast, snappy updates)
    const [localTables, setLocalTables] = React.useState<FloorPlanObject[]>([])
    const [pendingDeletions, setPendingDeletions] = React.useState<Set<string>>(new Set())
    const [pendingAdditions, setPendingAdditions] = React.useState<FloorPlanObject[]>([])

    // Local UI state
    const [activeFloorPlanId, setActiveFloorPlanId] = React.useState<string | null>(null)
    const [isDesignMode, setIsDesignMode] = React.useState(false)
    const [selectedTableIds, setSelectedTableIds] = React.useState<string[]>([])
    const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false)
    const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false)
    const [isMultipleAddDialogOpen, setIsMultipleAddDialogOpen] = React.useState(false)
    const [newFloorPlanName, setNewFloorPlanName] = React.useState('')
    const [newFloorPlanDescription, setNewFloorPlanDescription] = React.useState('')

    // Undo/Redo history
    const [past, setPast] = React.useState<FloorPlanObject[][]>([])
    const [future, setFuture] = React.useState<FloorPlanObject[][]>([])

    // Refs for tracking original state
    const originalTablesRef = React.useRef<Map<string, { x: number; y: number; rotation: number }>>(new Map())
    const prevTablesRef = React.useRef<string>('')
    const dragStartSnapshotRef = React.useRef<FloorPlanObject[] | null>(null)

    // Derive active floor plan from query data
    const activeFloorPlan = useMemo(() => {
        if (!activeFloorPlanId) {
            // Auto-select default or first floor plan
            const defaultPlan = floorPlans.find((fp) => fp.is_default) || floorPlans[0]
            if (defaultPlan && !activeFloorPlanId) {
                setActiveFloorPlanId(defaultPlan.id)
                return defaultPlan
            }
            return null
        }
        return floorPlans.find((fp) => fp.id === activeFloorPlanId) || null
    }, [floorPlans, activeFloorPlanId])

    // Get tables from active floor plan's objects (server data)
    const serverTables = useMemo(() => {
        return activeFloorPlan?.objects || []
    }, [activeFloorPlan])

    // Use local tables in design mode, server tables otherwise
    const tables = useMemo(() => {
        if (isDesignMode && localTables.length > 0) {
            // Filter out deleted tables and add pending additions
            return [
                ...localTables.filter((t) => !pendingDeletions.has(t.id)),
                ...pendingAdditions,
            ]
        }
        return serverTables
    }, [isDesignMode, localTables, serverTables, pendingDeletions, pendingAdditions])

    // Initialize local tables when entering design mode
    React.useEffect(() => {
        if (isDesignMode && serverTables.length > 0 && localTables.length === 0) {
            setLocalTables(sanitizeTables(serverTables))
            setPendingDeletions(new Set())
            setPendingAdditions([])
        } else if (!isDesignMode) {
            // Reset local state when exiting design mode
            setLocalTables([])
            setPendingDeletions(new Set())
            setPendingAdditions([])
        }
    }, [isDesignMode, serverTables.length])

    // Save snapshot for undo/redo (using local tables)
    const saveSnapshot = React.useCallback(() => {
        if (!isDesignMode) return
        const snapshot = sanitizeTables(tables)
        setPast((prev) => [...prev.slice(-49), snapshot]) // Keep last 50
        setFuture([])
    }, [tables, isDesignMode])

    // Undo function (works with local state in design mode)
    const handleUndo = React.useCallback(() => {
        if (past.length === 0 || !isDesignMode) return

        const previous = past[past.length - 1]
        const current = sanitizeTables(tables)

        // Restore previous state by separating existing tables from new/deleted ones
        const previousExisting = previous.filter((t) => !t.id.startsWith('temp-'))
        const previousNew = previous.filter((t) => t.id.startsWith('temp-'))

        // Restore local tables to previous state
        setLocalTables(previousExisting)
        // Restore pending additions
        setPendingAdditions(previousNew)
        // Restore pending deletions by comparing with server tables
        const previousIds = new Set(previous.map((t) => t.id))
        const deletedIds = serverTables.filter((t) => !previousIds.has(t.id)).map((t) => t.id)
        setPendingDeletions(new Set(deletedIds))

        setPast((prev) => prev.slice(0, -1))
        setFuture((prev) => [current, ...prev])
    }, [past, tables, isDesignMode, serverTables])

    // Redo function (works with local state in design mode)
    const handleRedo = React.useCallback(() => {
        if (future.length === 0 || !isDesignMode) return

        const next = future[0]
        const current = sanitizeTables(tables)

        // Restore next state
        const nextExisting = next.filter((t) => !t.id.startsWith('temp-'))
        const nextNew = next.filter((t) => t.id.startsWith('temp-'))

        // Restore local tables to next state
        setLocalTables(nextExisting)
        // Restore pending additions
        setPendingAdditions(nextNew)
        // Restore pending deletions
        const nextIds = new Set(next.map((t) => t.id))
        const deletedIds = serverTables.filter((t) => !nextIds.has(t.id)).map((t) => t.id)
        setPendingDeletions(new Set(deletedIds))

        setFuture((prev) => prev.slice(1))
        setPast((prev) => [...prev, current])
    }, [future, tables, isDesignMode, serverTables])

    // Track original tables when entering design mode
    React.useEffect(() => {
        if (isDesignMode && serverTables.length > 0 && originalTablesRef.current.size === 0) {
            // Capture snapshot of server tables when entering design mode
            originalTablesRef.current = new Map(
                serverTables.map((t) => [t.id, { x: t.x, y: t.y, rotation: t.rotation || 0 }])
            )
            prevTablesRef.current = JSON.stringify(
                serverTables.map((t) => ({ id: t.id, x: t.x, y: t.y, rotation: t.rotation || 0 }))
            )
            // Initialize history with server tables
            setPast([sanitizeTables(serverTables)])
            setFuture([])
        } else if (!isDesignMode) {
            // Reset when exiting design mode
            originalTablesRef.current.clear()
            prevTablesRef.current = ''
            setHasUnsavedChanges(false)
            setPast([])
            setFuture([])
        }
    }, [isDesignMode, serverTables.length, serverTables])

    // Detect changes - only when in design mode
    React.useEffect(() => {
        if (!isDesignMode || originalTablesRef.current.size === 0) {
            return
        }

        // Create a stable string representation for comparison
        const currentTablesStr = JSON.stringify(
            tables.map((t) => ({ id: t.id, x: t.x, y: t.y, rotation: t.rotation || 0 }))
        )

        // Only check for changes if the string representation changed
        if (currentTablesStr === prevTablesRef.current) {
            return
        }

        prevTablesRef.current = currentTablesStr

        // Compare tables efficiently (including additions/deletions)
        const hasPositionChanges = tables.some((table) => {
            const original = originalTablesRef.current.get(table.id)
            if (!original) return false // New table
            return (
                Math.abs(table.x - original.x) > 0.01 ||
                Math.abs(table.y - original.y) > 0.01 ||
                (table.rotation || 0) !== original.rotation
            )
        })

        const hasAdditionsOrDeletions = pendingAdditions.length > 0 || pendingDeletions.size > 0
        const hasChanges = hasPositionChanges || hasAdditionsOrDeletions || tables.length !== originalTablesRef.current.size

        setHasUnsavedChanges(hasChanges)
    }, [tables, isDesignMode])

    // Keyboard shortcuts for undo/redo
    React.useEffect(() => {
        if (!isDesignMode) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault()
                handleUndo()
            } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault()
                handleRedo()
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTableIds.length > 0) {
                e.preventDefault()
                // Delete selected tables
                saveSnapshot()
                selectedTableIds.forEach((tableId) => {
                    if (tableId.startsWith('temp-')) {
                        // Remove from pending additions
                        setPendingAdditions((prev) => prev.filter((t) => t.id !== tableId))
                    } else {
                        // Mark for deletion
                        setPendingDeletions((prev) => new Set([...prev, tableId]))
                        // Remove from local tables
                        setLocalTables((prev) => prev.filter((t) => t.id !== tableId))
                    }
                })
                setSelectedTableIds([])
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isDesignMode, handleUndo, handleRedo])

    const handleTableClick = (tableId: string) => {
        if (isDesignMode) {
            setSelectedTableIds((prev) =>
                prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
            )
        }
    }

    const handleTableDoubleClick = (tableId: string) => {
        if (!isDesignMode) return

        saveSnapshot()

        // Update local state immediately
        setLocalTables((prev) =>
            prev.map((t) =>
                t.id === tableId
                    ? { ...t, rotation: ((t.rotation || 0) + 90) % 360 }
                    : t
            )
        )
    }

    const handleTableDragStart = () => {
        if (!isDesignMode) return
        // Save snapshot when drag starts
        if (dragStartSnapshotRef.current === null) {
            dragStartSnapshotRef.current = sanitizeTables(tables)
            saveSnapshot()
        }
    }

    const handleTableDrag = (tableId: string, x: number, y: number) => {
        if (!isDesignMode) return

        // Update local state immediately for snappy feel
        setLocalTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, x, y } : t))
        )
    }

    const handleTableDragEnd = () => {
        dragStartSnapshotRef.current = null
    }

    const handleCanvasDrop = (x: number, y: number, shapeId?: string) => {
        if (!isDesignMode || !shapeId || !activeFloorPlanId) return

        const shape = TABLE_SHAPES[shapeId as keyof typeof TABLE_SHAPES]
        if (!shape) return

        saveSnapshot()

        // Create temporary table for local state (will get real ID on save)
        const tempId = `temp-${Date.now()}-${Math.random()}`
        const newTable: FloorPlanObject = {
            id: tempId,
            floor_plan_id: activeFloorPlanId,
            name: shape.label || 'New Table',
            shape_id: shapeId as keyof typeof TABLE_SHAPES,
            category: (shape?.category || 'table') as FloorPlanObject['category'],
            x,
            y,
            rotation: 0,
            width: shape?.width,
            height: shape?.height,
            capacity: shape?.capacity,
            z_index: 1,
            is_visible: true,
            is_active: true,
        }

        // Add to pending additions (will be persisted on save)
        setPendingAdditions((prev) => [...prev, newTable])
    }

    const handleTableSelect = (shapeId: keyof typeof TABLE_SHAPES) => {
        if (!isDesignMode || !activeFloorPlanId || !activeFloorPlan) return

        const shape = TABLE_SHAPES[shapeId]
        if (!shape) return

        saveSnapshot()

        // Use smart positioning
        const position = findNextAvailablePosition(
            tables,
            {
                width: shape.width || 100,
                height: shape.height || 100,
            },
            activeFloorPlan.grid_size || 20,
            activeFloorPlan.canvas_width || 2000,
            activeFloorPlan.canvas_height || 1500
        )

        // Create temporary table for local state
        const tempId = `temp-${Date.now()}-${Math.random()}`
        const newTable: FloorPlanObject = {
            id: tempId,
            floor_plan_id: activeFloorPlanId,
            name: shape.label || 'New Table',
            shape_id: shapeId,
            category: (shape?.category || 'table') as FloorPlanObject['category'],
            x: position.x,
            y: position.y,
            rotation: 0,
            width: shape?.width,
            height: shape?.height,
            capacity: shape?.capacity,
            z_index: 1,
            is_visible: true,
            is_active: true,
        }

        // Add to pending additions
        setPendingAdditions((prev) => [...prev, newTable])
    }

    const handleAddMultipleTables = (items: Array<{ shapeId: keyof typeof TABLE_SHAPES; quantity: number }>) => {
        if (!isDesignMode || !activeFloorPlanId || !activeFloorPlan) return

        saveSnapshot()

        let tempTables = [...tables]
        const newTables: FloorPlanObject[] = []

        for (const item of items) {
            const shape = TABLE_SHAPES[item.shapeId]
            if (!shape) continue

            for (let i = 0; i < item.quantity; i++) {
                const position = findNextAvailablePosition(
                    tempTables,
                    {
                        width: shape.width || 100,
                        height: shape.height || 100,
                    },
                    activeFloorPlan.grid_size || 20,
                    activeFloorPlan.canvas_width || 2000,
                    activeFloorPlan.canvas_height || 1500
                )

                const tempId = `temp-${Date.now()}-${Math.random()}-${i}`
                const newTable: FloorPlanObject = {
                    id: tempId,
                    floor_plan_id: activeFloorPlanId,
                    name: `${shape.label} ${tables.length + newTables.length + 1}`,
                    shape_id: item.shapeId,
                    category: (shape?.category || 'table') as FloorPlanObject['category'],
                    x: position.x,
                    y: position.y,
                    rotation: 0,
                    width: shape.width,
                    height: shape.height,
                    capacity: shape.capacity,
                    z_index: 1,
                    is_visible: true,
                    is_active: true,
                }

                newTables.push(newTable)
                tempTables.push(newTable)
            }
        }

        // Add all to pending additions
        setPendingAdditions((prev) => [...prev, ...newTables])
        setIsMultipleAddDialogOpen(false)
    }

    // Client-side merge state (since DB doesn't have merge columns yet)
    const [mergedTables, setMergedTables] = React.useState<Map<string, string[]>>(new Map())

    const handleMergeTables = () => {
        if (selectedTableIds.length < 2) {
            toast.error('Select at least 2 tables to merge')
            return
        }

        saveSnapshot()

        const primaryTableId = selectedTableIds[0]
        const mergedWith = selectedTableIds.slice(1)

        // Update merge state
        setMergedTables((prev) => {
            const newMap = new Map(prev)
            newMap.set(primaryTableId, mergedWith)
            // Mark merged tables as being merged with primary
            mergedWith.forEach((id) => {
                newMap.set(id, [primaryTableId])
            })
            return newMap
        })

        setSelectedTableIds([])
        toast.success('Tables merged', {
            description: 'Tables have been merged successfully',
        })
    }

    const handleUnmergeTables = (tableId: string) => {
        saveSnapshot()

        setMergedTables((prev) => {
            const newMap = new Map(prev)
            const mergedWith = newMap.get(tableId) || []
            // Remove merge state for all related tables
            newMap.delete(tableId)
            mergedWith.forEach((id) => {
                newMap.delete(id)
            })
            return newMap
        })

        setSelectedTableIds([])
        toast.success('Tables unmerged', {
            description: 'Tables have been unmerged successfully',
        })
    }

    // Apply merge state to tables for rendering
    const tablesWithMergeState = useMemo(() => {
        return tables.map((table) => {
            const mergedWith = mergedTables.get(table.id)
            const isPrimary = mergedWith && mergedWith.length > 0
            return {
                ...table,
                mergedWith: mergedWith || [],
                isPrimary: isPrimary || undefined,
            }
        })
    }, [tables, mergedTables])

    const handleUpdateTableName = (tableId: string, newName: string) => {
        if (!newName.trim()) return

        saveSnapshot()

        // Update local state immediately
        setLocalTables((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, name: newName.trim() } : t))
        )
        // Also update pending additions if it's a new table
        setPendingAdditions((prev) =>
            prev.map((t) => (t.id === tableId ? { ...t, name: newName.trim() } : t))
        )
    }

    const handleSave = async () => {
        if (!isDesignMode || !activeFloorPlanId) return

        try {
            // Collect all changes to batch persist
            const updates: Array<{ id: string; x: number; y: number; rotation?: number }> = []
            const nameUpdates: Array<{ id: string; name: string }> = []

            // Get current tables (local + pending additions, excluding deletions)
            const currentTables = [
                ...localTables.filter((t) => !pendingDeletions.has(t.id)),
                ...pendingAdditions,
            ]

            // Compare with original server tables to find position/rotation changes
            for (const table of currentTables) {
                const original = serverTables.find((t) => t.id === table.id)
                if (original) {
                    // Check if position or rotation changed
                    if (
                        Math.abs(table.x - original.x) > 0.01 ||
                        Math.abs(table.y - original.y) > 0.01 ||
                        (table.rotation || 0) !== (original.rotation || 0)
                    ) {
                        updates.push({
                            id: table.id,
                            x: table.x,
                            y: table.y,
                            rotation: table.rotation || 0,
                        })
                    }

                    // Check if name changed
                    if (table.name !== original.name) {
                        nameUpdates.push({
                            id: table.id,
                            name: table.name,
                        })
                    }
                }
            }

            // Batch update positions/rotations
            if (updates.length > 0) {
                await updateTablePositionsBatchMutation.mutateAsync(updates)
            }

            // Update names individually (no batch endpoint for names)
            for (const nameUpdate of nameUpdates) {
                await updateTableNameMutation.mutateAsync({
                    tableId: nameUpdate.id,
                    name: nameUpdate.name,
                })
            }

            // Add new tables
            for (const newTable of pendingAdditions) {
                await addTableMutation.mutateAsync({
                    floorPlanId: activeFloorPlanId,
                    tableData: {
                        name: newTable.name,
                        shape_id: newTable.shape_id,
                        category: newTable.category,
                        x: newTable.x,
                        y: newTable.y,
                        rotation: newTable.rotation || 0,
                        capacity: newTable.capacity,
                        width: newTable.width,
                        height: newTable.height,
                    },
                })
            }

            // Delete removed tables
            for (const tableId of pendingDeletions) {
                await removeTableMutation.mutateAsync(tableId)
            }

            // Reset local state and mark as saved
            originalTablesRef.current = new Map(
                currentTables.map((t) => [t.id, { x: t.x, y: t.y, rotation: t.rotation || 0 }])
            )
            prevTablesRef.current = JSON.stringify(
                currentTables.map((t) => ({ id: t.id, x: t.x, y: t.y, rotation: t.rotation || 0 }))
            )
            setHasUnsavedChanges(false)
            setPast([])
            setFuture([])
            setPendingDeletions(new Set())
            setPendingAdditions([])

            toast.success('Floor plan saved', {
                description: 'All changes have been saved successfully',
            })
        } catch (error) {
            toast.error('Error saving floor plan', {
                description: error instanceof Error ? error.message : 'Failed to save changes',
            })
            throw error
        }
    }

    const handleCreateFloorPlan = async () => {
        if (!newFloorPlanName.trim()) {
            toast.error('Name required', {
                description: 'Please enter a name for the floor plan',
            })
            return
        }

        try {
            const result = await createFloorPlanMutation.mutateAsync({
                name: newFloorPlanName,
                description: newFloorPlanDescription || undefined,
            })
            setActiveFloorPlanId(result.floorPlanId)
            setIsCreateDialogOpen(false)
            setNewFloorPlanName('')
            setNewFloorPlanDescription('')
            toast.success('Floor plan created', {
                description: 'New floor plan has been created successfully',
            })
        } catch (error) {
            toast.error('Error creating floor plan', {
                description: error instanceof Error ? error.message : 'Failed to create floor plan',
            })
        }
    }

    const handleFloorPlanChange = (floorPlanId: string) => {
        setActiveFloorPlanId(floorPlanId)
        setSelectedTableIds([])
        // Reset unsaved changes when switching floor plans
        setHasUnsavedChanges(false)
        originalTablesRef.current.clear()
        prevTablesRef.current = ''
        setPast([])
        setFuture([])
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading floor plan...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <p className="text-destructive mb-4">Error loading floor plans</p>
                    <p className="text-sm text-muted-foreground mb-4">
                        {error instanceof Error ? error.message : 'Unknown error'}
                    </p>
                    <Button onClick={onBack}>Go Back</Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-screen">
            <FloorPlanToolbar
                floorPlans={floorPlans}
                activeFloorPlanId={activeFloorPlanId}
                isDesignMode={isDesignMode}
                hasUnsavedChanges={hasUnsavedChanges}
                selectedTableIds={selectedTableIds}
                canUndo={past.length > 0}
                canRedo={future.length > 0}
                onBack={onBack}
                onFloorPlanChange={handleFloorPlanChange}
                onDesignModeToggle={() => setIsDesignMode(!isDesignMode)}
                onCreateFloorPlan={() => setIsCreateDialogOpen(true)}
                onSave={handleSave}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onMerge={selectedTableIds.length >= 2 ? handleMergeTables : undefined}
            />

            <div className="flex-1 flex overflow-hidden">
                {isDesignMode && (
                    <div className="border-r">
                        <TablePalette
                            onTableSelect={handleTableSelect}
                            onAddMultiple={() => setIsMultipleAddDialogOpen(true)}
                        />
                    </div>
                )}

                <div className="flex-1 relative">
                    {activeFloorPlan ? (
                        <InteractiveCanvas
                            floorPlan={activeFloorPlan}
                            tables={tablesWithMergeState}
                            selectedTableIds={selectedTableIds}
                            isDesignMode={isDesignMode}
                            onTableClick={handleTableClick}
                            onTableDoubleClick={handleTableDoubleClick}
                            onTableDrag={handleTableDrag}
                            onTableDragStart={handleTableDragStart}
                            onTableDragEnd={handleTableDragEnd}
                            onCanvasDrop={handleCanvasDrop}
                            onUpdateTableName={handleUpdateTableName}
                            onUnmergeTable={handleUnmergeTables}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                                <p className="text-muted-foreground mb-4">No floor plan selected</p>
                                <Button onClick={() => setIsCreateDialogOpen(true)}>Create Floor Plan</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Floor Plan Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Floor Plan</DialogTitle>
                        <DialogDescription>Create a new floor plan for this location</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                value={newFloorPlanName}
                                onChange={(e) => setNewFloorPlanName(e.target.value)}
                                placeholder="Main Dining Room"
                            />
                        </div>
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Input
                                id="description"
                                value={newFloorPlanDescription}
                                onChange={(e) => setNewFloorPlanDescription(e.target.value)}
                                placeholder="First floor dining area"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateFloorPlan} disabled={createFloorPlanMutation.isPending}>
                            {createFloorPlanMutation.isPending ? 'Creating...' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add Multiple Tables Dialog */}
            <MultipleTablesDialog
                open={isMultipleAddDialogOpen}
                onOpenChange={setIsMultipleAddDialogOpen}
                onAdd={handleAddMultipleTables}
            />
        </div>
    )
}

// Multiple Tables Dialog Component
interface MultipleTablesDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onAdd: (items: Array<{ shapeId: keyof typeof TABLE_SHAPES; quantity: number }>) => void
}

function MultipleTablesDialog({ open, onOpenChange, onAdd }: MultipleTablesDialogProps) {
    const [items, setItems] = React.useState<Array<{ shapeId: keyof typeof TABLE_SHAPES; quantity: number }>>([
        { shapeId: 'square-4', quantity: 1 },
    ])

    const addItem = () => {
        setItems([...items, { shapeId: 'square-4', quantity: 1 }])
    }

    const removeItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index))
    }

    const updateItem = (index: number, updates: Partial<typeof items[0]>) => {
        setItems(items.map((item, i) => (i === index ? { ...item, ...updates } : item)))
    }

    const handleSubmit = () => {
        onAdd(items.filter((item) => item.quantity > 0))
        setItems([{ shapeId: 'square-4', quantity: 1 }])
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add Multiple Tables</DialogTitle>
                    <DialogDescription>Add multiple tables at once with smart positioning</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {items.map((item, index) => (
                        <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
                            <Select
                                value={item.shapeId}
                                onValueChange={(value) => updateItem(index, { shapeId: value as keyof typeof TABLE_SHAPES })}
                            >
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(TABLE_SHAPES).map(([id, shape]) => (
                                        <SelectItem key={id} value={id}>
                                            {shape.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateItem(index, { quantity: parseInt(e.target.value) || 1 })}
                                className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">tables</span>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                                ×
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" onClick={addItem} className="w-full">
                        + Add Another Table Type
                    </Button>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit}>Add Tables</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
