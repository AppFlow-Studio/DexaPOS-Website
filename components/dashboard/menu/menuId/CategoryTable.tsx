'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Globe, GripVertical, MapPin, Trash2 } from 'lucide-react'
import { MenuCategory, MenuCategoryItem } from '@/types/menu'
import { useState, type MouseEventHandler, type ReactNode } from 'react'
import { DndContext, closestCenter, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CategoryItemsSheet } from './CategoryItemsSheet'
import { cn } from '@/lib/utils'

function SortableCategoryRow({
    id,
    showHandle,
    className,
    onClick,
    children,
}: {
    id: string
    showHandle: boolean
    className?: string
    onClick?: MouseEventHandler<HTMLTableRowElement>
    children: ReactNode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

    return (
        <TableRow
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`${className ?? ''} ${isDragging ? 'relative z-20 bg-card shadow-lg' : ''}`}
            onClick={onClick}
        >
            {showHandle && (
                <TableCell onClick={(event) => event.stopPropagation()}>
                    <button
                        type="button"
                        className="flex h-8 w-8 cursor-grab items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:cursor-grabbing"
                        aria-label="Drag to reorder category"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="h-4 w-4" />
                    </button>
                </TableCell>
            )}
            {children}
        </TableRow>
    )
}

interface CategoryTableProps {
    categories: MenuCategory[]
    menuId: string
    selectedLocationId: string | null
    isMenuLocationOwned?: boolean
    onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>
    onResetOverride?: (categoryId: string) => Promise<void>
    onRemoveCategory?: (categoryId: string) => void
    onEditItem?: (
        item: MenuCategoryItem,
        category: MenuCategory,
        menuId: string,
    ) => void
    hasOrderChanges?: boolean
    isReorderMode?: boolean
    onCategoryOrderChange?: (categories: MenuCategory[]) => void
}

export function CategoryTable({
    categories,
    menuId,
    selectedLocationId,
    isMenuLocationOwned,
    onToggleVisibility,
    onResetOverride,
    onRemoveCategory,
    onEditItem,
    hasOrderChanges = false,
    isReorderMode = false,
    onCategoryOrderChange,
}: CategoryTableProps) {
    const isAllLocations = !selectedLocationId || selectedLocationId === 'all'
    const canModifyCategories = isAllLocations || isMenuLocationOwned
    // Which category's item list is open, if any.
    const [itemsForCategory, setItemsForCategory] =
        useState<MenuCategory | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: { distance: 5 },
    }))

    const handleDragEnd = (event: DragEndEvent) => {
        if (event.active.id === event.over?.id) return
        const oldIndex = categories.findIndex((category) => category.id === event.active.id)
        const newIndex = categories.findIndex((category) => category.id === event.over?.id)
        if (oldIndex < 0 || newIndex < 0) return
        onCategoryOrderChange?.(arrayMove(categories, oldIndex, newIndex))
    }

    return (
        <div className="space-y-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <Table variant="data" className="min-w-[640px]">
                    <TableHeader>
                        <TableRow>
                            {isReorderMode && <TableHead className="w-10" />}
                            <TableHead className="w-[300px]">Category</TableHead>
                            <TableHead className="w-[150px]">Status</TableHead>
                            <TableHead className="w-[180px]">Location</TableHead>
                            <TableHead className="w-[80px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <SortableContext items={categories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
                        {categories.map((category) => {
                            const categoryLocationId = category.category?.location_id
                            const isGlobal = !categoryLocationId
                            const customTitle = (category as MenuCategory & { custom_title?: string | null }).custom_title

                            return (
                                <SortableCategoryRow
                                    key={category.id}
                                    id={category.id}
                                    showHandle={isReorderMode}
                                    className="group cursor-pointer"
                                    onClick={() => setItemsForCategory(category)}
                                >
                                    <TableCell className="font-medium">
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <span>{category.category?.name || 'Unknown'}</span>
                                            {customTitle && (
                                                <span className="truncate text-xs font-normal text-muted-foreground">
                                                    Displayed as {customTitle}
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={category.is_active}
                                                onCheckedChange={(checked) =>
                                                    void onToggleVisibility(category.category_id, checked)
                                                }
                                                aria-label={`${category.is_active ? 'Hide' : 'Show'} ${category.category?.name || 'category'}`}
                                            />
                                            <span
                                                className={cn(
                                                    'text-sm font-medium',
                                                    category.is_active
                                                        ? 'text-green-600'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                {category.is_active ? 'Active' : 'Hidden'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {isGlobal ? (
                                            <Badge
                                                variant="outline"
                                                className="gap-1 rounded-full border-0 bg-emerald-50 text-emerald-700"
                                            >
                                                <Globe className="h-3 w-3" />
                                                Global
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className="gap-1 rounded-full border-0 bg-blue-50 text-blue-700"
                                            >
                                                <MapPin className="h-3 w-3" />
                                                {category.category?.location_name || 'Location'}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell
                                        className="text-right"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-end gap-1">
                                            {!isAllLocations && category.category?.location_id === null && onResetOverride && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => onResetOverride(category.category_id)}
                                                >
                                                    Reset
                                                </Button>
                                            )}
                                            {canModifyCategories && onRemoveCategory && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    onClick={() => onRemoveCategory(category.category_id)}
                                                    aria-label={`Remove ${category.category?.name || 'category'}`}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </SortableCategoryRow>
                            )
                        })}
                        </SortableContext>
                    </TableBody>
                </Table>
            </DndContext>

            <CategoryItemsSheet
                category={itemsForCategory}
                open={!!itemsForCategory}
                onOpenChange={(open) => !open && setItemsForCategory(null)}
                onEditItem={(item, category) => {
                    // Close this panel before the editor so the two overlays
                    // never stack.
                    setItemsForCategory(null)
                    onEditItem?.(item, category, menuId)
                }}
            />
        </div>
    )
}


