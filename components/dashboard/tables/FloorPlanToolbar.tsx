// 'use client'

// import * as React from 'react'
// import { Button } from '@/components/ui/button'
// import { Badge } from '@/components/ui/badge'
// import {
//     Select,
//     SelectContent,
//     SelectItem,
//     SelectTrigger,
//     SelectValue,
// } from '@/components/ui/select'
// import { FloorPlan } from '@/types/floor-plan'
// import { ArrowLeft, Save, Edit, Eye, Plus, AlertCircle, Undo, Redo, Merge } from 'lucide-react'
// import { toast } from 'sonner'

// interface FloorPlanToolbarProps {
//     floorPlans: FloorPlan[]
//     activeFloorPlanId: string | null
//     isDesignMode: boolean
//     hasUnsavedChanges: boolean
//     selectedTableIds?: string[]
//     canUndo?: boolean
//     canRedo?: boolean
//     onBack: () => void
//     onFloorPlanChange: (floorPlanId: string) => void
//     onDesignModeToggle: () => void
//     onCreateFloorPlan: () => void
//     onSave: () => Promise<void>
//     onUndo?: () => void
//     onRedo?: () => void
//     onMerge?: () => void
// }

// export function FloorPlanToolbar({
//     floorPlans,
//     activeFloorPlanId,
//     isDesignMode,
//     hasUnsavedChanges,
//     selectedTableIds = [],
//     canUndo = false,
//     canRedo = false,
//     onBack,
//     onFloorPlanChange,
//     onDesignModeToggle,
//     onCreateFloorPlan,
//     onSave,
//     onUndo,
//     onRedo,
//     onMerge,
// }: FloorPlanToolbarProps) {
//     const [isSaving, setIsSaving] = React.useState(false)

//     const activeFloorPlan = floorPlans.find((fp) => fp.id === activeFloorPlanId)

//     const handleSave = async () => {
//         setIsSaving(true)
//         try {
//             await onSave()
//             toast.success('Floor plan saved', {
//                 description: 'Your changes have been saved successfully.',
//             })
//         } catch (error) {
//             toast.error('Error saving floor plan', {
//                 description: error instanceof Error ? error.message : 'Failed to save changes',
//             })
//         } finally {
//             setIsSaving(false)
//         }
//     }

//     return (
//         <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
//             <div className="flex items-center gap-4">
//                 <Button variant="ghost" size="sm" onClick={onBack}>
//                     <ArrowLeft className="h-4 w-4 mr-2" />
//                     Back
//                 </Button>

//                 <div className="flex items-center gap-2">
//                     <Select
//                         value={activeFloorPlanId || ''}
//                         onValueChange={onFloorPlanChange}
//                     >
//                         <SelectTrigger className="w-[200px]">
//                             <SelectValue placeholder="Select floor plan" />
//                         </SelectTrigger>
//                         <SelectContent>
//                             {floorPlans.map((fp) => (
//                                 <SelectItem key={fp.id} value={fp.id}>
//                                     {fp.name}
//                                     {fp.is_default && ' (Default)'}
//                                 </SelectItem>
//                             ))}
//                         </SelectContent>
//                     </Select>

//                     <Button variant="outline" size="sm" onClick={onCreateFloorPlan}>
//                         <Plus className="h-4 w-4 mr-2" />
//                         New
//                     </Button>
//                 </div>

//                 {activeFloorPlan && (
//                     <div className="text-sm text-muted-foreground">
//                         {activeFloorPlan.table_count || 0} tables
//                     </div>
//                 )}
//             </div>

//             <div className="flex items-center gap-3">
//                 {hasUnsavedChanges && (
//                     <Badge variant="outline" className="gap-1.5">
//                         <AlertCircle className="h-3 w-3" />
//                         Unsaved changes
//                     </Badge>
//                 )}

//                 {isDesignMode && (
//                     <>
//                         <Button
//                             variant="outline"
//                             size="sm"
//                             onClick={onUndo}
//                             disabled={!canUndo}
//                             title="Undo (Ctrl/Cmd+Z)"
//                         >
//                             <Undo className="h-4 w-4 mr-2" />
//                             Undo
//                         </Button>
//                         <Button
//                             variant="outline"
//                             size="sm"
//                             onClick={onRedo}
//                             disabled={!canRedo}
//                             title="Redo (Ctrl/Cmd+Shift+Z)"
//                         >
//                             <Redo className="h-4 w-4 mr-2" />
//                             Redo
//                         </Button>
//                         {selectedTableIds.length >= 2 && onMerge && (
//                             <Button variant="outline" size="sm" onClick={onMerge}>
//                                 <Merge className="h-4 w-4 mr-2" />
//                                 Merge ({selectedTableIds.length})
//                             </Button>
//                         )}
//                     </>
//                 )}

//                 <Button
//                     variant={isDesignMode ? 'default' : 'outline'}
//                     size="sm"
//                     onClick={onDesignModeToggle}
//                 >
//                     {isDesignMode ? (
//                         <>
//                             <Eye className="h-4 w-4 mr-2" />
//                             View Mode
//                         </>
//                     ) : (
//                         <>
//                             <Edit className="h-4 w-4 mr-2" />
//                             Design Mode
//                         </>
//                     )}
//                 </Button>

//                 {isDesignMode && (
//                     <Button
//                         variant="default"
//                         size="sm"
//                         onClick={handleSave}
//                         disabled={isSaving || !hasUnsavedChanges}
//                     >
//                         <Save className="h-4 w-4 mr-2" />
//                         {isSaving ? 'Saving...' : 'Save'}
//                     </Button>
//                 )}
//             </div>
//         </div>
//     )
// }

'use client'

import React from 'react'
import { TABLE_SHAPES, SHAPE_OPTIONS } from '@/utils/tables/table-shapes'
import { ScrollArea } from '@/components/ui/scroll-area'

export function FloorPlanEditorSidebar() {
    const handleDragStart = (e: React.DragEvent, shapeId: string) => {
        // We attach the Shape ID to the drag event
        e.dataTransfer.setData('shapeId', shapeId)
        e.dataTransfer.effectAllowed = 'copy'
    }

    return (
        <div className="w-64 bg-white border-r h-full flex flex-col z-20 shadow-xl">
            <div className="p-4 border-b">
                <h3 className="font-semibold text-sm">Library</h3>
                <p className="text-xs text-slate-500">Drag items onto the canvas</p>
            </div>

            <ScrollArea className="flex-1 h-full">
                <div className="p-4 grid grid-cols-2 gap-3">
                    {SHAPE_OPTIONS.map((shape) => {
                        const ShapeIcon = shape.component
                        return (
                            <div
                                key={shape.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, shape.id)}
                                className="flex flex-col items-center gap-2 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:border-blue-500 hover:bg-blue-50 cursor-grab active:cursor-grabbing transition-all"
                            >
                                <div className="w-12 h-12 relative flex items-center justify-center pointer-events-none">
                                    <ShapeIcon width={40} height={40} />
                                </div>
                                <span className="text-[10px] font-medium text-slate-600 text-center leading-tight">
                                    {shape.label}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}