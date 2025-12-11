'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty } from '@/components/ui/empty'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    Utensils,
    Plus,
    MoreVertical,
    Eye,
    Pencil,
    Trash2,
    Settings2,
    DollarSign,
    ChevronDown,
    ChevronUp,
    Package,
    AlertTriangle,
    Star,
    Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type {
    MenuItemWrapper,
    MenuModifierGroup,
    MenuModifierItem,
    MenuCategoryItem,
    PriceSource
} from '@/types/menu'

// Types for menu item modifier groups (used for item display)
export interface MenuItemModifierGroup {
    id: string
    display_order: number | null
    modifier_groups: {
        id: string
        name: string
        min_selections: number | null
        max_selections: number | null
        is_required: boolean
        modifier_group_items?: Array<{
            id: string
            name: string
            price_modifier: number
        }>
    }
}

export interface MenuItemForTable {
    id: string
    name: string
    description: string | null
    image: string | null
    base_price: number
    base_cash_price?: number | null
    menu_custom_price?: number | null
    menu_custom_cash_price?: number | null
    location_custom_price?: number | null
    effective_price: number
    effective_cash_price?: number | null
    is_available: boolean
    has_location_override?: boolean
    stock_tracking_mode?: 'in_stock' | 'out_of_stock' | 'quantity' | null
    modifier_groups?: MenuItemModifierGroup[]
    categories?: Array<{ id: string; name: string }>
    meal_types?: string[]
    allergens?: string[]
}

export interface MenuItemWithWrapper {
    id: string
    display_order: number | null
    menu_item: MenuItemForTable
}

// Props for legacy format
interface LegacyMenuItemsTableProps {
    items: MenuItemWrapper[]
    isLoading?: boolean
    showLocationPricing?: boolean
    onItemClick?: (itemId: string) => void
    onEditItem?: (itemId: string) => void
    onRemoveItem?: (itemId: string) => void
    onManageModifiers?: (itemId: string) => void
    onAddItem?: () => void
    addDisabled?: boolean
    addDisabledMessage?: string
    emptyStateTitle?: string
    emptyStateDescription?: string
}

// Props for category-centric format
interface CategoryItemsTableProps {
    items: MenuCategoryItem[]
    categoryId: string
    isLoading?: boolean
    showLocationPricing?: boolean
    onItemClick?: (itemId: string) => void
    onEditItem?: (itemId: string, categoryId: string) => void
    onRemoveItem?: (itemId: string, categoryId: string) => void
    onAddItem?: () => void
    addDisabled?: boolean
    emptyStateTitle?: string
    emptyStateDescription?: string
}

// Unified props type
type MenuItemsTableProps = LegacyMenuItemsTableProps

/**
 * @deprecated The menu page now uses CategorySection component for category-centric display.
 * This component is kept for backwards compatibility with the items library.
 */
export function MenuItemsTable({
    items,
    isLoading = false,
    showLocationPricing = false,
    onItemClick,
    onEditItem,
    onRemoveItem,
    onManageModifiers,
    onAddItem,
    addDisabled = false,
    emptyStateTitle = "No items",
    emptyStateDescription = "Add items to this menu",
}: MenuItemsTableProps) {
    const router = useRouter()
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    const handleRowClick = (itemId: string) => {
        if (onItemClick) {
            onItemClick(itemId)
        } else {
            router.push(`/dashboard/menu/items/${itemId}`)
        }
    }

    const toggleRowExpand = (e: React.MouseEvent, itemId: string) => {
        e.stopPropagation()
        setExpandedRows(prev => {
            const next = new Set(prev)
            if (next.has(itemId)) {
                next.delete(itemId)
            } else {
                next.add(itemId)
            }
            return next
        })
    }

    if (isLoading) {
        return (
            <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                ))}
            </div>
        )
    }

    if (items.length === 0) {
        return (
            <Empty
                icon={Utensils}
                title={emptyStateTitle}
                description={emptyStateDescription}
                action={
                    onAddItem ? (
                        <Button onClick={onAddItem} disabled={addDisabled}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                        </Button>
                    ) : null
                }
            />
        )
    }

    return (
        <div className="rounded-md border animate-in fade-in duration-300">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead className="w-[80px]">Image</TableHead>
                        <TableHead className="min-w-[200px]">Item</TableHead>
                        <TableHead className="w-[120px]">Modifiers</TableHead>
                        <TableHead className="w-[140px] text-right">Price</TableHead>
                        {showLocationPricing && (
                            <TableHead className="w-[120px] text-right">Location Price</TableHead>
                        )}
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item, index) => {
                        const menuItem = item.menu_item
                        const hasModifiers = menuItem && menuItem.modifier_groups && menuItem.modifier_groups.length > 0
                        const isExpanded = expandedRows.has(item.id)
                        const hasCustomPrice = item.custom_price !== null &&
                            item.custom_price !== undefined &&
                            item.custom_price !== menuItem.effective_price
                        const hasLocationOverride = item.is_available ||
                            (item.location_menu_override !== null && item.location_menu_override !== undefined)

                        return (
                            <React.Fragment key={item.id}>
                                <TableRow
                                    className={cn(
                                        "group cursor-pointer transition-colors hover:bg-muted/50 animate-in fade-in slide-in-from-left-2",
                                        !item.is_available && "opacity-60"
                                    )}
                                    style={{ animationDelay: `${index * 30}ms` }}
                                    onClick={() => handleRowClick(menuItem.id)}
                                >
                                    <TableCell className="p-2">
                                        {hasModifiers && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => toggleRowExpand(e, item.id)}
                                            >
                                                {isExpanded ? (
                                                    <ChevronUp className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDown className="h-4 w-4" />
                                                )}
                                            </Button>
                                        )}
                                    </TableCell>

                                    <TableCell>
                                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                                            <Utensils className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-medium group-hover:text-primary transition-colors flex items-center gap-2">
                                                {menuItem.name}
                                            </div>
                                            {menuItem.description && (
                                                <p className="text-sm text-muted-foreground line-clamp-1 max-w-[300px]">
                                                    {menuItem.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-1 flex-wrap">
                                                {menuItem.allergens && menuItem.allergens.length > 0 && (
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Badge variant="outline" className="text-xs gap-1 bg-amber-50 text-amber-700 border-amber-200">
                                                                    <AlertTriangle className="h-3 w-3" />
                                                                    {menuItem.allergens.length}
                                                                </Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                Allergens: {menuItem.allergens.join(', ')}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                )}
                                                {menuItem.meal_types && menuItem.meal_types.slice(0, 2).map(type => (
                                                    <Badge key={type} variant="secondary" className="text-xs">
                                                        {type}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell>
                                        {hasModifiers ? (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Badge variant="outline" className="gap-1">
                                                            <Settings2 className="h-3 w-3" />
                                                            {menuItem.modifier_groups!.length}
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="bottom" className="max-w-xs">
                                                        <div className="space-y-1">
                                                            {menuItem.modifier_groups!.map(({ id, name, is_required }: MenuModifierGroup) => (
                                                                <div key={id} className="text-sm">
                                                                    <span className="font-medium">{name}</span>
                                                                    {is_required && (
                                                                        <span className="text-red-500 ml-1">*</span>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>

                                    <TableCell className="text-right">
                                        <PriceDisplay
                                            basePrice={menuItem.price}
                                            customPrice={item.custom_price}
                                            effectivePrice={menuItem.effective_price}
                                            hasCustomPrice={hasCustomPrice}
                                        />
                                    </TableCell>

                                    {showLocationPricing && (
                                        <TableCell className="text-right">
                                            {hasLocationOverride ? (
                                                <div className="flex items-center justify-end gap-1">
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                        ${item.custom_price?.toFixed(2)}
                                                    </Badge>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">—</span>
                                            )}
                                        </TableCell>
                                    )}

                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            <Badge variant={menuItem.effective_availability ? "default" : "secondary"}>
                                                {menuItem.effective_availability ? 'Available' : 'Unavailable'}
                                            </Badge>
                                            {menuItem.stock_tracking_mode === 'out_of_stock' && (
                                                <Badge variant="destructive" className="text-xs">
                                                    <Package className="h-3 w-3 mr-1" />
                                                    Out of Stock
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>

                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4" />
                                                    <span className="sr-only">Open menu</span>
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuLabel>Item Actions</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRowClick(menuItem.id)
                                                }}>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    View Details
                                                </DropdownMenuItem>
                                                {onEditItem && (
                                                    <DropdownMenuItem onClick={(e) => {
                                                        e.stopPropagation()
                                                        onEditItem(menuItem.id)
                                                    }}>
                                                        <Pencil className="mr-2 h-4 w-4" />
                                                        Edit Item
                                                    </DropdownMenuItem>
                                                )}
                                                {onManageModifiers && (
                                                    <DropdownMenuItem onClick={(e) => {
                                                        e.stopPropagation()
                                                        onManageModifiers(menuItem.id)
                                                    }}>
                                                        <Settings2 className="mr-2 h-4 w-4" />
                                                        Manage Modifiers
                                                    </DropdownMenuItem>
                                                )}
                                                {onRemoveItem && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onRemoveItem(item.id)
                                                            }}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Remove from Menu
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>

                                {isExpanded && hasModifiers && (
                                    <TableRow key={`${item.id}-expanded`} className="bg-muted/30">
                                        <TableCell colSpan={showLocationPricing ? 8 : 7} className="p-4">
                                            <div className="space-y-3">
                                                <h4 className="text-sm font-medium flex items-center gap-2">
                                                    <Settings2 className="h-4 w-4" />
                                                    Modifier Groups
                                                </h4>
                                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                                    {menuItem.modifier_groups!.map(mg => (
                                                        <div
                                                            key={mg.id}
                                                            className="p-3 rounded-lg border bg-background"
                                                        >
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="font-medium text-sm">
                                                                    {mg.name}
                                                                </span>
                                                                {mg.is_required && (
                                                                    <Badge variant="destructive" className="text-xs">
                                                                        Required
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {mg.min_selections !== null && (
                                                                <p className="text-xs text-muted-foreground mb-2">
                                                                    Select {mg.min_selections}
                                                                    {mg.max_selections && mg.max_selections !== mg.min_selections
                                                                        ? ` - ${mg.max_selections}`
                                                                        : ''
                                                                    } option(s)
                                                                </p>
                                                            )}
                                                            {mg.items && (
                                                                <div className="space-y-1">
                                                                    {mg.items.slice(0, 4).map(({ id, name, price_modifier }: MenuModifierItem) => (
                                                                        <div
                                                                            key={id}
                                                                            className="flex items-center justify-between text-sm"
                                                                        >
                                                                            <span className="text-muted-foreground">{name}</span>
                                                                            {price_modifier > 0 && (
                                                                                <span className="text-green-600">
                                                                                    +${price_modifier.toFixed(2)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                    {mg.items.length > 4 && (
                                                                        <p className="text-xs text-muted-foreground">
                                                                            +{mg.items.length - 4} more options
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </React.Fragment>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    )
}

// Price Display Component
function PriceDisplay({
    basePrice,
    customPrice,
    effectivePrice,
    hasCustomPrice,
}: {
    basePrice: number
    customPrice?: number | null
    effectivePrice: number
    hasCustomPrice: boolean
}) {
    if (hasCustomPrice && customPrice !== null && customPrice !== undefined) {
        const isDiscount = customPrice < basePrice
        return (
            <div className="space-y-0.5">
                <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground line-through">
                        ${basePrice.toFixed(2)}
                    </span>
                    <span className={cn(
                        "font-semibold",
                        isDiscount ? "text-green-600" : "text-orange-600"
                    )}>
                        ${customPrice.toFixed(2)}
                    </span>
                </div>
                <Badge
                    variant="outline"
                    className={cn(
                        "text-xs",
                        isDiscount
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-orange-200 bg-orange-50 text-orange-700"
                    )}
                >
                    <DollarSign className="h-3 w-3 mr-0.5" />
                    {isDiscount ? '↓' : '↑'} Custom
                </Badge>
            </div>
        )
    }

    return (
        <span className="font-semibold">
            ${effectivePrice.toFixed(2)}
        </span>
    )
}

// Price Source Badge Component - Shows which level the price comes from
export function PriceSourceBadge({ source }: { source: PriceSource }) {
    const configs: Record<PriceSource, { label: string; className: string }> = {
        'base': { label: 'Base', className: 'bg-gray-100 text-gray-700 border-gray-200' },
        'location_item': { label: 'L2: Location', className: 'bg-blue-50 text-blue-700 border-blue-200' },
        'category': { label: 'L3: Category', className: 'bg-purple-50 text-purple-700 border-purple-200' },
        'location_category': { label: 'L4: Loc+Cat', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
        'location_menu': { label: 'L5: Menu', className: 'bg-green-50 text-green-700 border-green-200' },
    }

    const config = configs[source] || configs['base']

    return (
        <Badge variant="outline" className={cn("text-xs", config.className)}>
            <Tag className="h-3 w-3 mr-1" />
            {config.label}
        </Badge>
    )
}

// Export helpers
export { PriceDisplay }
