'use client'
//TODO: Setup or remove the items detailed page
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Utensils, Plus, Search, Grid3x3, List, Package, DollarSign, Edit3, Eye,
    MoreVertical, Tag, X, Filter, MapPin, Info, ChevronDown, ChevronRight,
    Globe, Layers, Sparkles, CreditCard, Monitor, ShieldCheck, ShieldX, Trash2
} from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCategoriesWithItems } from '../../hooks/useCategories'
import { useModifierGroups } from '../../hooks/useModifierGroups'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Empty } from '@/components/ui/empty'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useLocationScopedMenuItemsWithCategories, useLocationContext } from '../../hooks/useLocationScoped'
import { NewEditItemFormSheet, EditItemWithOverrides } from '@/components/dashboard/menu/NewEditItemFormSheet'
import { FlatItem, resetItemToLevel } from '../../actions/menu-items-rpc'
import { CategoryWithItems } from '@/types/menu'
import { useLocationStore } from '@/stores/location-store'
import { useLocationTaxRates } from '../../hooks/useTaxRates'
import { TAX_CATEGORY_LABELS } from '@/types/tax'
import { AVAILABLE_CHANNELS } from '@/types/inventory'
import { DeleteMenuItem } from '../../actions/menu-items'
import { CreateItemInCategory, AddItemToCategory } from '../../actions/item-assignments'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'grid' | 'list' | 'categories'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapFlatItemToEditItem(item: FlatItem | null): EditItemWithOverrides | undefined {
    if (!item) return undefined

    return {
        id: item.id,
        name: item.name,
        description: item.description ?? undefined,
        price: item.base_price,
        cash_price: item.base_cash_price,
        image: item.image ?? undefined,
        availability: item.effective_availability,
        allergens: item.allergens ?? undefined,
        card_bg_color: item.card_bg_color ?? undefined,
        stock_tracking_mode: item.stock_tracking_mode ?? undefined,
        category_items: item.categories.map(c => ({ id: c.id, name: c.name })),
        effective_price: item.effective_price,
        effective_cash_price: item.effective_cash_price,
        price_levels: {
            level_1_base: item.base_price,
            level_1_cash: item.base_cash_price,
            level_2_location_item: item.location_override?.custom_price ?? null,
            level_2_location_item_cash: item.location_override?.custom_cash_price ?? null,
            level_2_modifier: item.location_override?.price_modifier ?? null,
            level_2_modifier_type: null,
            level_3_category: null,
            level_3_category_cash: null,
            level_4_location_category: null,
            level_4_location_category_cash: null,
            level_5_location_menu: null,
            level_5_location_menu_cash: null,
        },
        has_location_item_override: item.has_location_override,
    }
}

// Price source badge colors
const PRICE_SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    base: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
    location_item: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    category: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    location_category: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200' },
    location_menu: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
}

// ============================================================================
// ITEM CARD COMPONENT
// ============================================================================

function ItemCard({
    item,
    onEdit,
    onView,
    onDelete,
    index = 0,
    taxRates = [],
    canDelete = false
}: {
    item: FlatItem
    onEdit: () => void
    onView: () => void
    onDelete: () => void
    index?: number
    taxRates?: any[]
    canDelete?: boolean
}) {
    const hasOverride = item.has_location_override
    const priceColors = PRICE_SOURCE_COLORS[item.price_source] || PRICE_SOURCE_COLORS.base

    // Tax info
    const taxRate = taxRates.find(r => r.tax_category === item.effective_tax_category)
    const taxAmount = taxRate && !item.effective_is_tax_exempt
        ? (item.effective_price * taxRate.percentage / 100).toFixed(2)
        : '0.00'

    return (
        <div
            className="group animate-in fade-in slide-in-from-bottom-4"
            style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
        >
            <Card className={cn(
                "overflow-hidden transition-all duration-300 h-full",
                "hover:shadow-lg hover:scale-[1.02] hover:border-primary/50",
                hasOverride && "ring-1 ring-amber-200",
                !item.effective_availability && "opacity-70"
            )}>
                {/* Image Section */}
                <div className="relative aspect-[4/3] bg-gradient-to-br from-muted/50 to-muted overflow-hidden">
                    {item.image ? (
                        <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Utensils className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                    )}

                    {/* Top badges */}
                    <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
                        {/* Price source indicator */}
                        {item.price_source !== 'base' && (
                            <Badge
                                variant="secondary"
                                className={cn(
                                    "text-[10px] px-1.5 py-0.5 gap-1",
                                    priceColors.bg, priceColors.text, priceColors.border
                                )}
                            >
                                {item.price_source === 'location_item' && <MapPin className="h-2.5 w-2.5" />}
                                {item.price_source === 'category' && <Tag className="h-2.5 w-2.5" />}
                                {item.price_source === 'location_category' && <Layers className="h-2.5 w-2.5" />}
                                {item.price_source.replace('_', ' ')}
                            </Badge>
                        )}

                        {/* Availability */}
                        {!item.effective_availability && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700">
                                Unavailable
                            </Badge>
                        )}
                    </div>

                    {/* Category badges at bottom */}
                    {item.categories.length > 0 && (
                        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                            {item.categories.slice(0, 2).map((cat) => (
                                <Badge
                                    key={cat.id}
                                    variant="secondary"
                                    className={cn(
                                        "text-[10px] px-1.5 py-0 bg-background/90 backdrop-blur-sm",
                                        cat.is_global
                                            ? "border-emerald-200 text-emerald-700"
                                            : "border-purple-200 text-purple-700"
                                    )}
                                >
                                    {cat.is_global ? (
                                        <Globe className="h-2.5 w-2.5 mr-0.5" />
                                    ) : (
                                        <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                    )}
                                    {cat.name}
                                </Badge>
                            ))}
                            {item.categories.length > 2 && (
                                <Badge
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 bg-background/90 backdrop-blur-sm"
                                >
                                    +{item.categories.length - 2}
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Hover overlay with actions */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end justify-center pb-14">
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-8 bg-white/95 hover:bg-white shadow-lg"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onEdit()
                                }}
                            >
                                <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                                Edit
                            </Button>
                            <Button
                                size="sm"
                                className="h-8 shadow-lg"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onView()
                                }}
                            >
                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                Details
                            </Button>

                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <CardContent className="p-4">
                    <div className="space-y-2">
                        <h3 className="font-semibold text-base line-clamp-1">{item.name}</h3>
                        {item.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {item.description}
                            </p>
                        )}
                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-baseline gap-2">
                                <span className="text-lg font-bold text-primary">
                                    ${item.effective_price.toFixed(2)}
                                </span>
                                {hasOverride && item.base_price !== item.effective_price && (
                                    <span className="text-sm text-muted-foreground line-through">
                                        ${item.base_price.toFixed(2)}
                                    </span>
                                )}
                            </div>
                            {item.effective_cash_price && (
                                <Badge variant="outline" className="text-xs">
                                    Cash: ${item.effective_cash_price.toFixed(2)}
                                </Badge>
                            )}
                        </div>

                        {/* Tax & Channel Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-3 border-t mt-3">
                            {/* Tax Badge */}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[10px] px-1.5 py-0.5 cursor-help",
                                                item.effective_is_tax_exempt
                                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                            )}
                                        >
                                            {item.effective_is_tax_exempt ? (
                                                <>
                                                    <ShieldX className="h-2.5 w-2.5 mr-0.5" />
                                                    Tax Exempt
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                                    {TAX_CATEGORY_LABELS[item.effective_tax_category as keyof typeof TAX_CATEGORY_LABELS] || item.effective_tax_category}
                                                    {taxRate && `: ${taxRate.percentage}%`}
                                                </>
                                            )}
                                        </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        {item.effective_is_tax_exempt ? (
                                            <p>This item is tax exempt</p>
                                        ) : taxRate ? (
                                            <div className="space-y-1">
                                                <p className="font-medium">{taxRate.name}</p>
                                                <p className="text-xs">
                                                    Rate: {taxRate.percentage}% • Tax: ${taxAmount}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Total with tax: ${(parseFloat(item.effective_price.toString()) + parseFloat(taxAmount)).toFixed(2)}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-amber-600">No tax rate set for this category</p>
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            {/* Channel Badges */}
                            {item.effective_available_channels?.map((channel) => (
                                <Badge
                                    key={channel}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0.5"
                                >
                                    {channel === 'pos' && <CreditCard className="h-2.5 w-2.5 mr-0.5" />}
                                    {channel === 'online' && <Globe className="h-2.5 w-2.5 mr-0.5" />}
                                    {channel === 'kiosk' && <Monitor className="h-2.5 w-2.5 mr-0.5" />}
                                    {channel.toUpperCase()}
                                </Badge>
                            ))}
                        </div>
                    </div>
                    {canDelete && (
                        <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 bg-red-500/95 hover:bg-red-600 shadow-lg"
                            onClick={(e) => {
                                e.stopPropagation()
                                onDelete()
                            }}
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

// ============================================================================
// ITEM ROW COMPONENT (List View)
// ============================================================================

function ItemRow({
    item,
    onEdit,
    onView,
    onDelete,
    index = 0,
    taxRates = [],
    canDelete = false
}: {
    item: FlatItem
    onEdit: () => void
    onView: () => void
    onDelete: () => void
    index?: number
    taxRates?: any[]
    canDelete?: boolean
}) {
    const hasOverride = item.has_location_override
    const priceColors = PRICE_SOURCE_COLORS[item.price_source] || PRICE_SOURCE_COLORS.base

    // Tax info
    const taxRate = taxRates.find(r => r.tax_category === item.effective_tax_category)
    const taxAmount = taxRate && !item.effective_is_tax_exempt
        ? (item.effective_price * taxRate.percentage / 100).toFixed(2)
        : '0.00'

    return (
        <div
            className="group animate-in fade-in slide-in-from-left-4"
            style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
        >
            <div className={cn(
                "flex items-center gap-4 p-4 rounded-xl border bg-card transition-all duration-200",
                "hover:shadow-md hover:border-primary/30",
                hasOverride && "ring-1 ring-amber-200",
                !item.effective_availability && "opacity-70"
            )}>
                {/* Image */}
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                    {item.image ? (
                        <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Utensils className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{item.name}</h4>
                            {item.description && (
                                <p className="text-sm text-muted-foreground truncate">
                                    {item.description}
                                </p>
                            )}
                            {/* Category, Tax & Channel tags */}
                            <div className="flex flex-wrap gap-1 mt-2">
                                {/* Category tags */}
                                {item.categories.slice(0, 3).map((cat) => (
                                    <Badge
                                        key={cat.id}
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] px-1.5 py-0",
                                            cat.is_global
                                                ? "border-emerald-200 text-emerald-700"
                                                : "border-purple-200 text-purple-700"
                                        )}
                                    >
                                        {cat.is_global ? (
                                            <Globe className="h-2.5 w-2.5 mr-0.5" />
                                        ) : (
                                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                        )}
                                        {cat.name}
                                    </Badge>
                                ))}
                                {item.categories.length > 3 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        +{item.categories.length - 3}
                                    </Badge>
                                )}

                                {/* Tax Badge */}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    "text-[10px] px-1.5 py-0 cursor-help",
                                                    item.effective_is_tax_exempt
                                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                                        : "bg-blue-50 text-blue-700 border-blue-200"
                                                )}
                                            >
                                                {item.effective_is_tax_exempt ? (
                                                    <>
                                                        <ShieldX className="h-2.5 w-2.5 mr-0.5" />
                                                        Exempt
                                                    </>
                                                ) : (
                                                    <>
                                                        <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />
                                                        {TAX_CATEGORY_LABELS[item.effective_tax_category as keyof typeof TAX_CATEGORY_LABELS] || item.effective_tax_category}
                                                    </>
                                                )}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                            {item.effective_is_tax_exempt ? (
                                                <p>Tax exempt</p>
                                            ) : taxRate ? (
                                                <div className="space-y-1">
                                                    <p className="font-medium text-xs">{taxRate.name}</p>
                                                    <p className="text-xs">Rate: {taxRate.percentage}% • Tax: ${taxAmount}</p>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-amber-600">No rate set</p>
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>

                                {/* Channel Badges */}
                                {item.effective_available_channels?.map((channel) => (
                                    <Badge key={channel} variant="secondary" className="text-[10px] px-1.5 py-0">
                                        {channel === 'pos' && <CreditCard className="h-2.5 w-2.5 mr-0.5" />}
                                        {channel === 'online' && <Globe className="h-2.5 w-2.5 mr-0.5" />}
                                        {channel === 'kiosk' && <Monitor className="h-2.5 w-2.5 mr-0.5" />}
                                        {channel.toUpperCase()}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Price and indicators */}
                        <div className="text-right shrink-0 flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-primary">
                                    ${item.effective_price.toFixed(2)}
                                </span>
                                {hasOverride && item.base_price !== item.effective_price && (
                                    <span className="text-xs text-muted-foreground line-through">
                                        ${item.base_price.toFixed(2)}
                                    </span>
                                )}
                            </div>
                            {item.price_source !== 'base' && (
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "text-[10px] px-1.5",
                                        priceColors.bg, priceColors.text, priceColors.border
                                    )}
                                >
                                    {item.price_source === 'location_item' && <MapPin className="h-2.5 w-2.5" />}
                                    {item.price_source === 'category' && <Tag className="h-2.5 w-2.5" />}
                                </Badge>
                            )}
                            {!item.effective_availability && (
                                <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">
                                    Off
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={(e) => {
                            e.stopPropagation()
                            onEdit()
                        }}
                    >
                        <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                        Edit
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={(e) => {
                            e.stopPropagation()
                            onView()
                        }}
                    >
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Details
                    </Button>
                    {canDelete && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                                e.stopPropagation()
                                onDelete()
                            }}
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Delete
                        </Button>
                    )}
                </div>

                {/* Mobile dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 md:hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={onEdit}>
                            <Edit3 className="h-4 w-4 mr-2" />
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={onView}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                        </DropdownMenuItem>
                        {canDelete && (
                            <DropdownMenuItem
                                onClick={onDelete}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}

// ============================================================================
// CATEGORY GROUP COMPONENT
// ============================================================================

function CategoryGroup({
    category,
    items,
    isExpanded,
    onToggle,
    onEditItem,
    onViewItem,
    onDeleteItem,
    canDeleteItems = false,
    taxRates = [],
    isAllLocations = false,
    selectedLocationId = null,
}: {
    category: { id: string; name: string; is_global: boolean; location_name?: string | null }
    items: FlatItem[]
    isExpanded: boolean
    onToggle: () => void
    onEditItem: (item: FlatItem) => void
    onViewItem: (item: FlatItem) => void
    onDeleteItem: (item: FlatItem) => void
    canDeleteItems?: boolean
    taxRates?: any[]
    isAllLocations?: boolean
    selectedLocationId?: string | null
}) {
    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <Card className="overflow-hidden">
                <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {isExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                )}
                                <div className="flex items-center gap-2">
                                    <Tag className="h-5 w-5 text-primary" />
                                    <CardTitle className="text-lg">{category.name}</CardTitle>
                                    {category.is_global ? (
                                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200">
                                            <Globe className="h-3 w-3 mr-1" />
                                            Global
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                                            <MapPin className="h-3 w-3 mr-1" />
                                            {category.location_name || 'Location'}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <Badge variant="secondary">
                                {items.length} item{items.length !== 1 ? 's' : ''}
                            </Badge>
                        </div>
                    </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <CardContent className="pt-0">
                        {items.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Utensils className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No items in this category</p>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {items.map((item, idx) => {
                                    // Can delete if: viewing all locations OR item belongs to current location
                                    const itemCanDelete = isAllLocations
                                        ? true
                                        : (!isAllLocations && item.location_id === selectedLocationId)
                                    return (
                                        <ItemCard
                                            key={item.id}
                                            item={item}
                                            index={idx}
                                            taxRates={taxRates}
                                            onEdit={() => onEditItem(item)}
                                            onView={() => onViewItem(item)}
                                            onDelete={() => onDeleteItem(item)}
                                            canDelete={itemCanDelete && canDeleteItems}
                                        />
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function MenuItemsPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const router = useRouter()
    const queryClient = useQueryClient()
    const searchParams = useSearchParams()
    const { selectedLocationId } = useLocationStore()

    // Location context
    const { isAllLocations, locationName } = useLocationContext()

    // Tax rates for current location
    const { data: taxRatesData } = useLocationTaxRates()
    const taxRates = taxRatesData?.data || []

    // Get flat items with categories
    const { data: itemsData, isLoading, isError, refetch } = useLocationScopedMenuItemsWithCategories()

    // Get categories for filtering
    const { data: categoriesData } = useCategoriesWithItems(clerkOrgId || '', selectedLocationId)
    const { data: modifierGroups } = useModifierGroups(clerkOrgId)

    // State
    const [searchTerm, setSearchTerm] = useState('')
    const [viewMode, setViewMode] = useState<ViewMode>('grid')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<FlatItem | null>(null)
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
    const [showCategoryFilter, setShowCategoryFilter] = useState(false)
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
    const [deletingItem, setDeletingItem] = useState<FlatItem | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false)

    // Read category filter from URL
    useEffect(() => {
        const categoryParam = searchParams.get('category')
        if (categoryParam) {
            setSelectedCategoryId(categoryParam)
            setShowCategoryFilter(true)
        }
    }, [searchParams])

    // Extract data
    const itemsList = useMemo(() => {
        return Array.isArray(itemsData?.data) ? itemsData.data as FlatItem[] : []
    }, [itemsData?.data])

    const categoriesList = useMemo(() => {
        return Array.isArray(categoriesData?.data) ? categoriesData.data as CategoryWithItems[] : []
    }, [categoriesData?.data])

    // Filter items
    const filteredItems = useMemo(() => {
        let filtered = itemsList

        // Search filter
        if (searchTerm) {
            const query = searchTerm.toLowerCase()
            filtered = filtered.filter(item =>
                item.name.toLowerCase().includes(query) ||
                item.description?.toLowerCase().includes(query) ||
                item.categories.some(c => c.name.toLowerCase().includes(query))
            )
        }

        // Category filter
        if (selectedCategoryId) {
            if (selectedCategoryId === 'uncategorized') {
                filtered = filtered.filter(item => item.categories.length === 0)
            } else {
                filtered = filtered.filter(item =>
                    item.categories.some(c => c.id === selectedCategoryId)
                )
            }
        }

        return filtered
    }, [itemsList, searchTerm, selectedCategoryId])

    // Group items by category for category view
    const itemsByCategory = useMemo(() => {
        const groups = new Map<string, { category: typeof categoriesList[0]; items: FlatItem[] }>()

        // Create groups for each category
        for (const category of categoriesList) {
            groups.set(category.id, {
                category: category,
                items: []
            })
        }

        // Add items to their categories
        for (const item of filteredItems) {
            for (const cat of item.categories) {
                const group = groups.get(cat.id)
                if (group) {
                    group.items.push(item)
                }
            }
        }

        // Add uncategorized items
        const uncategorizedItems = filteredItems.filter(item => item.categories.length === 0)
        if (uncategorizedItems.length > 0) {
            groups.set('uncategorized', {
                category: {
                    id: 'uncategorized',
                    name: 'Uncategorized',
                    description: null,
                    image: null,
                    display_order: 999,
                    is_global: true,
                    location_id: null,
                    location_name: null,
                    is_active: true,
                    effective_is_active: true,
                    effective_display_order: 999,
                    effective_name: 'Uncategorized',
                    items: [],
                    item_count: 0,
                    menu_count: 0,
                    has_location_override: false,
                    location_override: null,
                    created_at: '',
                    created_by: '',
                    updated_at: '',
                } as CategoryWithItems,
                items: uncategorizedItems
            })
        }

        return Array.from(groups.values()).filter(g => g.items.length > 0)
    }, [categoriesList, filteredItems])

    // Stats
    const stats = useMemo(() => ({
        total: itemsList.length,
        available: itemsList.filter(i => i.effective_availability).length,
        unavailable: itemsList.filter(i => !i.effective_availability).length,
        withOverrides: itemsList.filter(i => i.has_location_override).length,
        avgPrice: itemsList.length > 0
            ? itemsList.reduce((acc, i) => acc + i.effective_price, 0) / itemsList.length
            : 0,
        uncategorized: itemsList.filter(i => i.categories.length === 0).length,
    }), [itemsList])

    // Category counts for filter
    const categoryItemCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        itemsList.forEach(item => {
            item.categories.forEach(cat => {
                counts[cat.id] = (counts[cat.id] || 0) + 1
            })
        })
        return counts
    }, [itemsList])

    // Handlers
    const handleQuickEdit = (item: FlatItem) => {
        setEditingItem(item)
        setIsCreateSheetOpen(true)
    }

    const handleViewDetails = (item: FlatItem) => {
        router.push(`/dashboard/menu/items/${item.id}`)
    }

    const toggleCategoryExpanded = (categoryId: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev)
            if (next.has(categoryId)) {
                next.delete(categoryId)
            } else {
                next.add(categoryId)
            }
            return next
        })
    }

    const expandAllCategories = () => {
        setExpandedCategories(new Set(itemsByCategory.map(g => g.category.id)))
    }

    const collapseAllCategories = () => {
        setExpandedCategories(new Set())
    }

    // Handle deleting location override (reset to global)
    const handleDeleteLocationOverride = async () => {
        if (!deletingItem || !selectedLocationId || isAllLocations) return

        setIsDeleting(true)
        try {
            const result = await resetItemToLevel(deletingItem.id, 1, {
                locationId: selectedLocationId
            })

            if (result.error || !result.success) {
                toast.error('Delete Failed', {
                    description: result.error || 'Unable to remove location override. Please try again.'
                })
                return
            }

            toast.success('Location Override Removed', {
                description: `"${deletingItem.name}" will now use global pricing at this location.`
            })

            queryClient.invalidateQueries({ queryKey: ['menu-items-flat'] })
            queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
            refetch()
        } catch (error) {
            toast.error('Delete Failed', {
                description: 'Unable to remove location override. Please try again.'
            })
        } finally {
            setIsDeleting(false)
            setDeletingItem(null)
        }
    }

    // Handle deleting item entirely
    const handleDeleteItem = async () => {
        if (!deletingItem) return

        // When viewing a specific location, only allow deleting location-specific items
        if (!isAllLocations) {
            if (deletingItem.location_id !== selectedLocationId) {
                toast.error('Delete Failed', {
                    description: 'You can only delete items that belong to this location.'
                })
                setDeletingItem(null)
                return
            }
        }

        setIsDeleting(true)
        try {
            const result = await DeleteMenuItem(deletingItem.id)

            if (result.error) {
                toast.error('Delete Failed', {
                    description: result.error
                })
                return
            }

            toast.success('Item Deleted', {
                description: isAllLocations
                    ? `"${deletingItem.name}" has been permanently deleted from all locations.`
                    : `"${deletingItem.name}" has been permanently deleted.`
            })

            queryClient.invalidateQueries({ queryKey: ['menu-items-flat'] })
            queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
            refetch()
        } catch (error) {
            toast.error('Delete Failed', {
                description: 'Unable to delete item. Please try again.'
            })
        } finally {
            setIsDeleting(false)
            setDeletingItem(null)
        }
    }

    // Error state
    const hasError = (itemsData && 'error' in itemsData && itemsData.error) || itemsData?.success === false
    const errorMessage = itemsData && 'error' in itemsData && typeof itemsData.error === 'string'
        ? itemsData.error
        : 'Error fetching menu items'

    if (hasError && !isLoading) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Menu Items</h2>
                        <p className="text-muted-foreground">Manage your menu items</p>
                    </div>
                </div>
                <Empty
                    icon={Utensils}
                    title="Error loading items"
                    description={errorMessage}
                    action={
                        <Button onClick={() => refetch()} variant="outline">
                            Try Again
                        </Button>
                    }
                />

                {/* Create Item Wizard */}
                <CreateItemWizard
                    open={isCreateWizardOpen}
                    onOpenChange={setIsCreateWizardOpen}
                    clerkOrgId={clerkOrgId || ''}
                    categoriesList={categoriesList}
                    isAllLocations={isAllLocations}
                    selectedLocationId={selectedLocationId}
                    onSuccess={() => {
                        setIsCreateWizardOpen(false)
                        queryClient.invalidateQueries({ queryKey: ['menu-items-flat'] })
                        queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
                        refetch()
                    }}
                />
            </div>
        )
    }

    // ============================================================================
    // CREATE ITEM WIZARD COMPONENT
    // ============================================================================

    const createItemSchema = z.object({
        name: z.string().min(2, 'Name must be at least 2 characters').max(100),
        description: z.string().max(500).optional(),
        price: z.number().min(0, 'Price must be positive'),
        cash_price: z.number().min(0).optional().nullable(),
        image: z.string().optional(),
    })

    type CreateItemFormValues = z.infer<typeof createItemSchema>

    interface CreateItemWizardProps {
        open: boolean
        onOpenChange: (open: boolean) => void
        clerkOrgId: string
        categoriesList: CategoryWithItems[]
        isAllLocations: boolean
        selectedLocationId: string | null
        onSuccess?: () => void
    }

    function CreateItemWizard({
        open,
        onOpenChange,
        clerkOrgId,
        categoriesList,
        isAllLocations,
        selectedLocationId,
        onSuccess,
    }: CreateItemWizardProps) {
        const queryClient = useQueryClient()
        const { data: userInfo } = useUserInfo()
        const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || ''
        const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
        const [isSaving, setIsSaving] = useState(false)

        // Filter categories based on location context
        const accessibleCategories = useMemo(() => {
            return categoriesList.filter(c =>
                isAllLocations
                    ? c.is_global
                    : c.location_id === selectedLocationId
            )
        }, [categoriesList, isAllLocations, selectedLocationId])

        const form = useForm<CreateItemFormValues>({
            resolver: zodResolver(createItemSchema),
            defaultValues: {
                name: '',
                description: '',
                price: 0,
                cash_price: null,
                image: '',
            },
        })

        // Reset on close
        useEffect(() => {
            if (!open) {
                setSelectedCategories(new Set())
                form.reset()
            }
        }, [open, form])

        const handleToggleCategory = (categoryId: string) => {
            setSelectedCategories(prev => {
                const next = new Set(prev)
                if (next.has(categoryId)) {
                    next.delete(categoryId)
                } else {
                    next.add(categoryId)
                }
                return next
            })
        }

        const handleCreateItem = async (values: CreateItemFormValues) => {
            if (selectedCategories.size === 0) {
                toast.error('Please select at least one category')
                return
            }

            if (!clerkOrgId) {
                toast.error('Organization not found')
                return
            }

            setIsSaving(true)

            try {
                const categoryIds = Array.from(selectedCategories)
                let successCount = 0
                let errorCount = 0
                let createdItemId: string | null = null

                // Create item in first category, then add to others
                for (let i = 0; i < categoryIds.length; i++) {
                    const categoryId = categoryIds[i]
                    const result = await CreateItemInCategory(
                        clerkOrgId,
                        categoryId,
                        {
                            name: values.name,
                            description: values.description,
                            price: values.price,
                            cashPrice: values.cash_price ?? undefined,
                            image: values.image,
                        },
                        {
                            locationId: isAllLocations ? null : selectedLocationId
                        }
                    )

                    if (result.error) {
                        errorCount++
                        console.error(`Failed to create item in category ${categoryId}:`, result.error)
                    } else {
                        successCount++
                        if (i === 0 && result.data) {
                            createdItemId = result.data.id
                        }
                    }

                    // For subsequent categories, add the item to them
                    if (i > 0 && createdItemId && merchantId) {
                        const addResult = await AddItemToCategory(
                            categoryId,
                            createdItemId,
                            merchantId
                        )
                        if (addResult.error) {
                            errorCount++
                        } else {
                            successCount++
                        }
                    }
                }

                if (successCount > 0) {
                    toast.success(`Item created and added to ${successCount} categor${successCount !== 1 ? 'ies' : 'y'}`, {
                        description: errorCount > 0 ? `${errorCount} category assignment${errorCount !== 1 ? 's' : ''} failed` : undefined,
                    })
                } else {
                    toast.error('Failed to create item', {
                        description: 'Please try again',
                    })
                    return
                }

                queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
                queryClient.invalidateQueries({ queryKey: ['menu-items'] })
                queryClient.invalidateQueries({ queryKey: ['menu-items-flat'] })

                onSuccess?.()
                onOpenChange(false)
            } catch (error) {
                console.error('Error creating item:', error)
                toast.error('Failed to create item')
            } finally {
                setIsSaving(false)
            }
        }

        return (
            <BottomSheet open={open} onOpenChange={onOpenChange}>
                <BottomSheetContent className="h-[85vh]">
                    <BottomSheetHeader>
                        <BottomSheetTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" />
                            Create New Item
                        </BottomSheetTitle>
                        <BottomSheetDescription>
                            Create a new menu item and assign it to categories
                        </BottomSheetDescription>
                    </BottomSheetHeader>

                    <BottomSheetBody className="flex-1 overflow-y-auto">
                        {/* Context Banner */}
                        <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                            <div className="flex items-center gap-2 text-sm">
                                <MapPin className="h-4 w-4 text-primary" />
                                <span className="font-medium">Creating for:</span>
                                <Badge variant="outline" className="bg-background">
                                    {isAllLocations ? 'All Locations (Global)' : 'This Location'}
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {isAllLocations
                                    ? 'This item will be available at all locations.'
                                    : 'This item will be specific to this location only.'}
                            </p>
                        </div>

                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(handleCreateItem)} className="space-y-4">
                                {/* Name */}
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }: { field: any }) => (
                                        <FormItem>
                                            <FormLabel>Item Name *</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g., Margherita Pizza" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Description */}
                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({ field }: { field: any }) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Describe your item..."
                                                    className="resize-none"
                                                    rows={3}
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Prices */}
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="price"
                                        render={({ field }: { field: any }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1">
                                                    <DollarSign className="h-3 w-3" />
                                                    Price *
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        placeholder="0.00"
                                                        {...field}
                                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="cash_price"
                                        render={({ field }: { field: any }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-1">
                                                    <DollarSign className="h-3 w-3" />
                                                    Cash Price
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        placeholder="Optional"
                                                        value={field.value ?? ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value
                                                            field.onChange(val ? parseFloat(val) : null)
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                {/* Image URL */}
                                <FormField
                                    control={form.control}
                                    name="image"
                                    render={({ field }: { field: any }) => (
                                        <FormItem>
                                            <FormLabel>Image URL</FormLabel>
                                            <FormControl>
                                                <Input placeholder="https://..." {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Category Selection */}
                                <div className="space-y-3">
                                    <FormLabel className="text-base font-semibold">
                                        Assign to Categories * <span className="text-muted-foreground text-sm font-normal">(Select at least one)</span>
                                    </FormLabel>
                                    {accessibleCategories.length === 0 ? (
                                        <div className="p-4 rounded-lg border bg-muted/30 text-center">
                                            <Tag className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                            <p className="text-sm text-muted-foreground">
                                                {isAllLocations
                                                    ? 'No global categories available. Create a global category first.'
                                                    : 'No location-specific categories available. Create a category for this location first.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                                            {accessibleCategories.map((category) => {
                                                const isSelected = selectedCategories.has(category.id)
                                                return (
                                                    <div
                                                        key={category.id}
                                                        className={cn(
                                                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                                            isSelected
                                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                                : "border-border hover:border-primary/30 hover:bg-muted/30"
                                                        )}
                                                        onClick={() => handleToggleCategory(category.id)}
                                                    >
                                                        <Checkbox
                                                            checked={isSelected}
                                                            onCheckedChange={() => handleToggleCategory(category.id)}
                                                            className="shrink-0"
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-medium text-sm">{category.name}</h4>
                                                                {category.is_global ? (
                                                                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200">
                                                                        <Globe className="h-3 w-3 mr-1" />
                                                                        Global
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                                                                        <MapPin className="h-3 w-3 mr-1" />
                                                                        Location
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {category.description && (
                                                                <p className="text-xs text-muted-foreground truncate mt-1">
                                                                    {category.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </form>
                        </Form>
                    </BottomSheetBody>

                    <BottomSheetFooter className="border-t pt-4">
                        <div className="flex items-center justify-between w-full">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isSaving}
                            >
                                Cancel
                            </Button>

                            <Button
                                onClick={form.handleSubmit(handleCreateItem)}
                                disabled={isSaving || selectedCategories.size === 0 || !form.formState.isValid}
                                className="gap-2"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-4 w-4" />
                                        Create Item
                                    </>
                                )}
                            </Button>
                        </div>
                    </BottomSheetFooter>
                </BottomSheetContent>
            </BottomSheet>
        )
    }

    const selectedCategory = categoriesList.find(c => c.id === selectedCategoryId)

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold tracking-tight">Item Library</h2>
                        <Badge
                            variant={isAllLocations ? "secondary" : "default"}
                            className={cn(
                                "gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300",
                                !isAllLocations && "bg-blue-500/10 text-blue-600 border-blue-200"
                            )}
                        >
                            {isAllLocations ? (
                                <Globe className="h-3 w-3" />
                            ) : (
                                <MapPin className="h-3 w-3" />
                            )}
                            {locationName}
                        </Badge>
                        {!isAllLocations && stats.withOverrides > 0 && (
                            <Badge
                                variant="outline"
                                className="gap-1 bg-amber-500/10 text-amber-600 border-amber-200"
                            >
                                <Sparkles className="h-3 w-3" />
                                {stats.withOverrides} with local pricing
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground mt-1">
                        {isAllLocations
                            ? 'All items across your organization. Items live within categories.'
                            : `Viewing items for ${locationName} with location-specific pricing.`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => setIsCreateWizardOpen(true)} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create Item
                    </Button>
                    <Button onClick={() => router.push('/dashboard/menu/categories')} variant="outline" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Items to Categories
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                        <Utensils className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">
                            In {categoriesList.length} categories
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available</CardTitle>
                        <Package className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{stats.available}</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.unavailable > 0 ? `${stats.unavailable} unavailable` : 'All items available'}
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Price</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">${stats.avgPrice.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">
                            Across all items
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Uncategorized</CardTitle>
                        <Tag className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={cn(
                            "text-2xl font-bold",
                            stats.uncategorized > 0 ? "text-amber-600" : "text-muted-foreground"
                        )}>
                            {stats.uncategorized}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {stats.uncategorized > 0 ? 'Need categorization' : 'All items categorized'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Items List */}
            <Card>
                <CardHeader className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>All Items</CardTitle>
                            <CardDescription>
                                {selectedCategoryId
                                    ? `${filteredItems.length} items in ${selectedCategoryId === 'uncategorized' ? 'uncategorized' : selectedCategory?.name || 'selected category'}`
                                    : `${filteredItems.length} items found`}
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search items..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 w-48 sm:w-64"
                                />
                            </div>

                            {/* Category Filter Toggle */}
                            {categoriesList.length > 0 && (
                                <Button
                                    variant={showCategoryFilter ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                                    className={cn(
                                        "gap-1.5",
                                        selectedCategoryId && !showCategoryFilter && "border-primary text-primary"
                                    )}
                                >
                                    <Filter className="h-4 w-4" />
                                    Filter
                                    {selectedCategoryId && (
                                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                                            1
                                        </Badge>
                                    )}
                                </Button>
                            )}

                            {/* View Mode Toggle */}
                            <div className="flex items-center border rounded-lg overflow-hidden">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-none"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <Grid3x3 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-none border-x"
                                    onClick={() => setViewMode('list')}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'categories' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-none"
                                    onClick={() => setViewMode('categories')}
                                >
                                    <Layers className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Category Filter Pills */}
                    {showCategoryFilter && categoriesList.length > 0 && (
                        <div className="space-y-3 pt-2 border-t animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant={selectedCategoryId === null ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedCategoryId(null)}
                                    className="h-7 text-xs"
                                >
                                    All
                                    <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                                        {itemsList.length}
                                    </Badge>
                                </Button>
                                {categoriesList.map((category) => {
                                    const count = categoryItemCounts[category.id] || 0
                                    return (
                                        <Button
                                            key={category.id}
                                            variant={selectedCategoryId === category.id ? "default" : "outline"}
                                            size="sm"
                                            onClick={() => setSelectedCategoryId(category.id)}
                                            className={cn(
                                                "h-7 text-xs gap-1",
                                                count === 0 && "opacity-50"
                                            )}
                                        >
                                            {category.is_global ? (
                                                <Globe className="h-3 w-3" />
                                            ) : (
                                                <MapPin className="h-3 w-3" />
                                            )}
                                            {category.name}
                                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                                {count}
                                            </Badge>
                                        </Button>
                                    )
                                })}
                                {stats.uncategorized > 0 && (
                                    <Button
                                        variant={selectedCategoryId === 'uncategorized' ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedCategoryId('uncategorized')}
                                        className="h-7 text-xs border-dashed"
                                    >
                                        Uncategorized
                                        <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                                            {stats.uncategorized}
                                        </Badge>
                                    </Button>
                                )}
                            </div>

                            {selectedCategoryId && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Filtered by:</span>
                                    <Badge variant="secondary" className="gap-1 pr-1">
                                        {selectedCategoryId === 'uncategorized'
                                            ? 'Uncategorized'
                                            : selectedCategory?.name || 'Unknown'}
                                        <button
                                            onClick={() => setSelectedCategoryId(null)}
                                            className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Category view controls */}
                    {viewMode === 'categories' && (
                        <div className="flex items-center gap-2 pt-2 border-t">
                            <Button variant="outline" size="sm" onClick={expandAllCategories}>
                                Expand All
                            </Button>
                            <Button variant="outline" size="sm" onClick={collapseAllCategories}>
                                Collapse All
                            </Button>
                        </div>
                    )}
                </CardHeader>

                <CardContent>
                    {isLoading ? (
                        <div className={viewMode === 'grid' || viewMode === 'categories'
                            ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                            : 'space-y-3'
                        }>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <Skeleton key={i} className={viewMode === 'list' ? 'h-20' : 'h-64'} />
                            ))}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <Empty
                            icon={Utensils}
                            title={itemsList.length === 0 ? "No items yet" : selectedCategoryId ? "No items in this category" : "No items found"}
                            description={
                                itemsList.length === 0
                                    ? "Items live within categories. Create categories first, then add items."
                                    : selectedCategoryId
                                        ? "Try selecting a different category or clear the filter"
                                        : "Try adjusting your search terms"
                            }
                            action={
                                itemsList.length === 0 ? (
                                    <Button onClick={() => router.push('/dashboard/menu/categories')}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Go to Categories
                                    </Button>
                                ) : selectedCategoryId ? (
                                    <Button variant="outline" onClick={() => setSelectedCategoryId(null)}>
                                        <X className="h-4 w-4 mr-2" />
                                        Clear Filter
                                    </Button>
                                ) : null
                            }
                        />
                    ) : viewMode === 'categories' ? (
                        // Category Groups View
                        <div className="space-y-4">
                            {itemsByCategory.map((group) => {
                                // Can delete if: viewing all locations OR any item in group belongs to current location
                                const canDelete = isAllLocations || group.items.some(item => item.location_id === selectedLocationId)
                                return (
                                    <CategoryGroup
                                        key={group.category.id}
                                        category={{
                                            id: group.category.id,
                                            name: group.category.name,
                                            is_global: group.category.is_global,
                                            location_name: group.category.location_name
                                        }}
                                        items={group.items}
                                        isExpanded={expandedCategories.has(group.category.id)}
                                        onToggle={() => toggleCategoryExpanded(group.category.id)}
                                        onEditItem={handleQuickEdit}
                                        onViewItem={handleViewDetails}
                                        onDeleteItem={(item) => setDeletingItem(item)}
                                        canDeleteItems={canDelete}
                                        taxRates={taxRates}
                                        isAllLocations={isAllLocations}
                                        selectedLocationId={selectedLocationId}
                                    />
                                )
                            })}
                        </div>
                    ) : viewMode === 'grid' ? (
                        // Grid View
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredItems.map((item, index) => {
                                // Can delete if: viewing all locations OR item belongs to current location
                                const canDelete = isAllLocations
                                    ? true
                                    : (!isAllLocations && item.location_id === selectedLocationId)

                                return (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        index={index}
                                        taxRates={taxRates}
                                        onEdit={() => handleQuickEdit(item)}
                                        onView={() => handleViewDetails(item)}
                                        onDelete={() => setDeletingItem(item)}
                                        canDelete={canDelete}
                                    />
                                )
                            })}
                        </div>
                    ) : (
                        // List View
                        <div className="space-y-2">
                            {filteredItems.map((item, index) => {
                                // Can delete if: viewing all locations OR item belongs to current location
                                const canDelete = isAllLocations
                                    ? true
                                    : (!isAllLocations && item.location_id === selectedLocationId)
                                return (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        index={index}
                                        taxRates={taxRates}
                                        onEdit={() => handleQuickEdit(item)}
                                        onView={() => handleViewDetails(item)}
                                        onDelete={() => setDeletingItem(item)}
                                        canDelete={canDelete}
                                    />
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Item Sheet */}
            <NewEditItemFormSheet
                open={isCreateSheetOpen}
                onOpenChange={(open) => {
                    setIsCreateSheetOpen(open)
                    if (!open) setEditingItem(null)
                }}
                clerkOrgId={clerkOrgId}
                editItem={mapFlatItemToEditItem(editingItem)}
                categories={categoriesList.map(c => ({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    is_active: c.is_active,
                    display_order: c.display_order,
                    merchant_id: '',
                    menu_id: null,
                    image: c.image,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                }))}
                modifierGroups={modifierGroups}
                onSuccess={() => {
                    setIsCreateSheetOpen(false)
                    setEditingItem(null)
                    queryClient.invalidateQueries({ queryKey: ['menu-items-flat'] })
                    queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
                    refetch()
                }}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <Trash2 className="h-5 w-5" />
                            {isAllLocations ? 'Delete Item' : 'Remove Location Override'}
                        </DialogTitle>
                        <DialogDescription>
                            {isAllLocations ? (
                                <>
                                    Are you sure you want to delete &quot;{deletingItem?.name}&quot;?
                                    This will permanently remove the item from all locations, menus, and categories.
                                    <span className="block mt-2 font-medium text-foreground">This action cannot be undone.</span>
                                </>
                            ) : (
                                <>
                                    Are you sure you want to delete &quot;{deletingItem?.name}&quot;?
                                    This will permanently remove this location-specific item from {locationName}.
                                    <span className="block mt-2 font-medium text-foreground">This action cannot be undone.</span>
                                    <span className="block mt-2 text-sm text-muted-foreground">
                                        Only items that belong to this location can be deleted.
                                    </span>
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeletingItem(null)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteItem}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <>
                                    <span className="animate-spin mr-2">⏳</span>
                                    Deleting...
                                </>
                            ) : (
                                <>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Item
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
