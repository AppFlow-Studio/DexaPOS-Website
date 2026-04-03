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

import React, { useState } from 'react'
import { TABLE_SHAPES, SHAPE_OPTIONS } from '@/utils/tables/table-shapes'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, LayoutGrid, Plus } from 'lucide-react'

type ShapeCategory = 'table' | 'booth' | 'functional' | 'structure' | 'decor' | 'zone'

interface CategoryConfig {
  label: string
  description: string
}

const CATEGORY_CONFIG: Record<ShapeCategory, CategoryConfig> = {
  table: { label: 'Tables', description: 'Seating for guests' },
  booth: { label: 'Booths', description: 'Booth seating' },
  functional: { label: 'Functional', description: 'Service areas' },
  structure: { label: 'Structure', description: 'Walls & pillars' },
  decor: { label: 'Decor', description: 'Decorative items' },
  zone: { label: 'Zones', description: 'Area markers' },
}

const LIBRARY_SHAPE_COLOR = '#9CA3AF'

interface FloorPlanEditorSidebarProps {
  onAddShape?: (shapeId: keyof typeof TABLE_SHAPES) => void
  onOpenShapePicker?: () => void
  onOpenQuickSetup?: () => void
}

export function FloorPlanEditorSidebar({
  onAddShape,
  onOpenShapePicker,
  onOpenQuickSetup,
}: FloorPlanEditorSidebarProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<ShapeCategory>>(
    new Set(['table', 'booth', 'functional'])
  )

  const handleDragStart = (e: React.DragEvent, shapeId: string) => {
    e.dataTransfer.setData('shapeId', shapeId)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const toggleCategory = (category: ShapeCategory) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Group shapes by category
  const shapesByCategory = Object.values(TABLE_SHAPES).reduce((acc, shape) => {
    const category = shape.category as ShapeCategory
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(shape)
    return acc
  }, {} as Record<ShapeCategory, typeof SHAPE_OPTIONS>)

  return (
    <div className="w-64 bg-background border-r h-full flex flex-col z-20 shadow-xl">
      <div className="p-4 border-b shrink-0">
        <h3 className="font-semibold text-sm">Shape Library</h3>
        <p className="text-xs text-muted-foreground">Drag or click shapes onto the canvas</p>
        <div className="mt-3 grid gap-2">
          <Button variant="default" size="sm" onClick={onOpenShapePicker}>
            <Plus className="mr-2 h-4 w-4" />
            Add Object
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenQuickSetup}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Quick Setup
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 h-full">
        <div className="p-3 space-y-4">
          {(Object.keys(CATEGORY_CONFIG) as ShapeCategory[]).map((category) => {
            const shapes = shapesByCategory[category] || []
            if (shapes.length === 0) return null

            const isExpanded = expandedCategories.has(category)
            const config = CATEGORY_CONFIG[category]

            return (
              <div key={category} className="space-y-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleCategory(category)}
                  className="w-full justify-start gap-2 text-sm font-medium h-auto py-1.5"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <div className="text-left flex-1">
                    <div>{config.label}</div>
                    <div className="text-xs text-muted-foreground font-normal">{config.description}</div>
                  </div>
                </Button>

                {isExpanded && (
                  <div className="grid grid-cols-2 gap-2 pl-2">
                    {shapes.map((shape) => {
                      const ShapeIcon = shape.component
                      return (
                        <div
                          key={shape.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, shape.id)}
                          onClick={() => onAddShape?.(shape.id as keyof typeof TABLE_SHAPES)}
                          className="flex flex-col items-center gap-1.5 p-2.5 rounded border border-border bg-background hover:border-primary hover:bg-primary/10 cursor-grab active:cursor-grabbing transition-all"
                          title={shape.label}
                        >
                          <div className="w-10 h-10 flex items-center justify-center pointer-events-none">
                            <ShapeIcon width={32} height={32} color={LIBRARY_SHAPE_COLOR} />
                          </div>
                          <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight line-clamp-2">
                            {shape.label}
                          </span>
                          {shape.capacity > 0 && (
                            <span className="text-[8px] text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded">
                              {shape.capacity}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
