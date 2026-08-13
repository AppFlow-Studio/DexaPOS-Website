'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { GripVertical, ChevronUp, ChevronDown, Eye, EyeOff, Globe, MapPin, Trash2 } from 'lucide-react'
import { MenuCategory } from '@/types/menu'
import { LocationBadge } from '@/components/dashboard/menu/MenuListView'
import { useIsSingleLocation } from '@/stores/location-store'

interface CategoryTableProps {
    categories: MenuCategory[]
    menuId: string
    selectedLocationId: string | null
    isMenuLocationOwned?: boolean
    onMoveUp?: (index: number) => void
    onMoveDown?: (index: number) => void
    onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>
    onResetOverride?: (categoryId: string) => Promise<void>
    onRemoveCategory?: (categoryId: string) => void
    hasOrderChanges?: boolean
}

export function CategoryTable({
    categories,
    menuId,
    selectedLocationId,
    isMenuLocationOwned,
    onMoveUp,
    onMoveDown,
    onToggleVisibility,
    onResetOverride,
    onRemoveCategory,
    hasOrderChanges = false,
}: CategoryTableProps) {
    const isSingleLocation = useIsSingleLocation()
    const isAllLocations = !selectedLocationId || selectedLocationId === 'all'
    const canModifyCategories = isAllLocations || isMenuLocationOwned

    return (
        <div className="space-y-4">
            <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-[750px]">
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="w-[60px]">Order</TableHead>
                            <TableHead className="w-[250px]">Category Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px]">Display Order</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[100px]">Item Count</TableHead>
                            {!isSingleLocation && <TableHead className="w-[150px]">Location</TableHead>}
                            <TableHead className="w-[120px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {categories.map((category, index) => {
                            const itemCount = category.items?.length || 0
                            const categoryLocationId = category.category?.location_id
                            const isGlobal = !categoryLocationId

                            return (
                                <TableRow key={category.id} className="group">
                                    {!isSingleLocation && <TableCell>
                                        <div className="flex items-center gap-1">
                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                            <div className="flex flex-col gap-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onMoveUp?.(index)
                                                    }}
                                                    disabled={index === 0 || !onMoveUp}
                                                    title="Move up"
                                                >
                                                    <ChevronUp className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onMoveDown?.(index)
                                                    }}
                                                    disabled={index === categories.length - 1 || !onMoveDown}
                                                    title="Move down"
                                                >
                                                    <ChevronDown className="h-3 w-3" />
                                                </Button>
                                            </div>
                                            <span className="text-xs text-muted-foreground ml-1">
                                                {category.display_order ?? '—'}
                                            </span>
                                        </div>
                                    </TableCell>}
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <span>{category.category?.name || 'Unknown'}</span>
                                            {category.custom_title && (
                                                <Badge variant="outline" className="text-xs">
                                                    Custom: {category.custom_title}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-muted-foreground line-clamp-1 max-w-[300px]">
                                            {category.category?.description || '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-muted-foreground">
                                            {category.display_order ?? '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 gap-1"
                                            onClick={() => onToggleVisibility(category.category_id, !category.is_active)}
                                        >
                                            {category.is_active ? (
                                                <>
                                                    <Eye className="h-3 w-3" />
                                                    <span className="text-xs">Active</span>
                                                </>
                                            ) : (
                                                <>
                                                    <EyeOff className="h-3 w-3" />
                                                    <span className="text-xs">Hidden</span>
                                                </>
                                            )}
                                        </Button>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm font-medium">{itemCount}</span>
                                    </TableCell>
                                    <TableCell>
                                        {isGlobal ? (
                                            <Badge
                                                variant="outline"
                                                className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
                                            >
                                                <Globe className="h-3 w-3" />
                                                Global
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className="gap-1 bg-blue-50 text-blue-700 border-blue-200"
                                            >
                                                <MapPin className="h-3 w-3" />
                                                {category.category?.location_name || 'Location'}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {!isAllLocations && category.category?.location_id === null && onResetOverride && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs"
                                                    onClick={() => onResetOverride(category.category_id)}
                                                    title="Reset to global"
                                                >
                                                    Reset
                                                </Button>
                                            )}
                                            {canModifyCategories && onRemoveCategory && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-destructive hover:text-destructive"
                                                    onClick={() => onRemoveCategory(category.category_id)}
                                                    title="Remove category from menu"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}


