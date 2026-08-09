'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Info, Utensils, Star, DollarSign, CircleSlash, Layers, Loader2, MoreHorizontal, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuCategoryItem } from '@/types/menu'
import { PriceSourcePopover } from '@/components/dashboard/menu/PriceSourcePopover'
import {
    priceSourceToLevel,
    scopeColor,
    scopeIcon,
    deriveScopeFromContext,
} from '@/lib/menu/cascade-labels'
import {
    useIsAllLocations,
    useSelectedLocation,
    useGatedLocationId,
} from '@/stores/location-store'
import { useClerkOrgId } from '@/app/dashboard/hooks/useLocationScoped'
import { useActiveSnoozes } from '@/lib/queries/use-snoozes'
import { isActivelySnoozed, snoozeShortLabel } from '@/lib/snooze'
import { useState } from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRestoreItem, useSnoozeItem, type SnoozeDuration } from '@/lib/queries/use-snoozes'

interface CategoryItemRowProps {
    item: MenuCategoryItem
    onClick: () => void
    showLocationPricing: boolean
    onEdit: () => void
    // Selection mode
    isSelectionMode?: boolean
    isSelected?: boolean
    onToggleSelect?: () => void
}

const PRICE_SOURCE_LABELS: Record<string, string> = {
    location_menu: "Menu at location",
    location_category: "Category at location",
    category: "Category default",
    location_item: "Location override",
    base: "Global",
}

export function CategoryItemRow({
    item,
    onClick,
    showLocationPricing,
    onEdit,
    isSelectionMode = false,
    isSelected = false,
    onToggleSelect,
}: CategoryItemRowProps) {
    const menuItem = item.menu_item
    const [imageFailed, setImageFailed] = useState(false)
    const snoozeItem = useSnoozeItem()
    const restoreItem = useRestoreItem()
    const priceSource = menuItem?.price_source || 'base'
    const sourceLevel = priceSourceToLevel(priceSource)
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()

    // 86 / out-of-stock state. All rows share ONE useActiveSnoozes fetch (React
    // Query dedupes by key), so this is a single request per location, not per row.
    const clerkOrgId = useClerkOrgId()
    const gatedLocationId = useGatedLocationId()
    const stockActionBusy = snoozeItem.isPending || restoreItem.isPending
    const markOutOfStock = (duration: SnoozeDuration) => {
        if (!clerkOrgId || !gatedLocationId) return
        snoozeItem.mutate({
            clerkOrgId,
            menuItemId: item.menu_item_id,
            locationId: gatedLocationId,
            duration,
            itemName: menuItem?.name,
            image: menuItem?.image,
        })
    }
    const restoreStock = () => {
        if (!clerkOrgId || !gatedLocationId) return
        restoreItem.mutate({ clerkOrgId, menuItemId: item.menu_item_id, locationId: gatedLocationId })
    }
    const { data: activeSnoozes } = useActiveSnoozes(
        clerkOrgId,
        gatedLocationId ?? 'all',
    )
    const snoozedUntil =
        activeSnoozes?.items.find((s) => s.menu_item_id === item.menu_item_id)
            ?.snoozed_until ?? null
    const isOutOfStock = isActivelySnoozed(snoozedUntil)

    // Any of this item's modifier OPTIONS 86'd (a whole-group 86 fans out to all
    // its options, so this catches both). Derived from data already on the row —
    // no extra fetch. Option-level snooze only, so a deliberately-inactive group
    // isn't mistaken for out-of-stock.
    const hasOutOfStockModifier = (menuItem?.modifier_groups ?? []).some((g) =>
        (g.items ?? []).some((o) => isActivelySnoozed(o.snoozed_until)),
    )

    // Single mobile status indicator, most severe first: a hard "unavailable"
    // outranks a temporary 86, which outranks a modifier-level 86. Mirrors the
    // desktop badge row, which stays visible at `sm:` and up.
    const statusDot = !menuItem?.effective_availability
        ? { className: 'bg-destructive', label: 'Unavailable in this menu' }
        : isOutOfStock
          ? {
                className: 'bg-amber-500',
                label: `Out of stock · ${snoozeShortLabel(snoozedUntil as string)}`,
            }
          : hasOutOfStockModifier
            ? {
                  className: 'bg-amber-500',
                  label: 'One or more modifier options are out of stock',
              }
            : null

    const getPriceSourceBadge = () => {
        if (priceSource === 'base') return null
        const colors = scopeColor(sourceLevel)
        const Icon = scopeIcon(sourceLevel)
        const base = PRICE_SOURCE_LABELS[priceSource] || "Override"
        const label =
            priceSource === 'location_item' && selectedLocation?.name
                ? `${selectedLocation.name} override`
                : base
        return (
            <Badge
                variant="outline"
                className={`text-[10px] gap-1 border max-w-full min-w-0 ${colors.text} ${colors.bg} ${colors.border}`}
            >
                <Icon className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{label}</span>
            </Badge>
        )
    }

    return (
        <div
            className={cn(
                "flex items-center gap-2 px-1 py-3 sm:gap-4 sm:px-2 hover:bg-muted/50 cursor-pointer transition-colors rounded-lg min-w-0",
                isSelectionMode && isSelected && "bg-primary/5",
            )}
            onClick={isSelectionMode ? onToggleSelect : onEdit}
        >
            {/* Selection checkbox */}
            {isSelectionMode && (
                <div
                    className="flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
                >
                    <Checkbox checked={isSelected} />
                </div>
            )}

            {/* Item image — hidden on mobile, where the row needs its width for
                the name, price and badges. */}
            <div className="hidden h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-muted sm:flex items-center justify-center overflow-hidden flex-shrink-0">
                {menuItem?.image && !imageFailed ? (
                    <img
                        src={menuItem.image}
                        alt={menuItem?.name || ''}
                        className="h-full w-full object-cover"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <Utensils className="h-6 w-6 text-muted-foreground" />
                )}
            </div>

            {/* Details + price + badges. Name and price share the top row;
                badges wrap onto their own full-width row below so they never
                collide with the price column on narrow screens. */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2 min-w-0">
                    {/* Item name */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <h4 className="font-medium truncate">{menuItem?.name}</h4>
                            {item.is_featured && (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                            )}
                            {/* Mobile status dot — stands in for the full-width
                                badge row below, which is hidden on mobile so every
                                item row keeps the same height. Tappable: the
                                popover explains what the colour means. */}
                            {statusDot && (
                                <Popover>
                                    <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            aria-label={statusDot.label}
                                            className={cn(
                                                'h-2.5 w-2.5 shrink-0 rounded-full sm:hidden',
                                                statusDot.className
                                            )}
                                        />
                                    </PopoverTrigger>
                                    <PopoverContent
                                        align="start"
                                        className="w-auto max-w-[15rem] px-3 py-2 text-xs"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {statusDot.label}
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                        {/* Truncated to a few words at this width, so it earns its
                            line only on desktop. */}
                    </div>

                    {/* Price */}
                    <div className="text-right flex-shrink-0 flex items-center gap-1 sm:gap-2">
                        <div className="flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
                            <PriceSourcePopover
                                itemId={menuItem?.id || item.menu_item_id}
                                currentPrice={menuItem?.effective_price ?? 0}
                                sourceLevel={sourceLevel}
                                locationId={
                                    isAllLocations ? null : selectedLocation?.id ?? null
                                }
                                canRemoveOverride={sourceLevel === 2 && !isAllLocations}
                                editScope={deriveScopeFromContext({
                                    isAllLocations,
                                    locationName: selectedLocation?.name ?? null,
                                })}
                            >
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                    {/* The `$` glyph is redundant beside a price;
                                        desktop keeps it, mobile reclaims the width. */}
                                    <DollarSign className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                                    <span className="font-semibold">
                                        {menuItem?.effective_price?.toFixed(2) || '0.00'}
                                    </span>
                                    <Info className="h-3 w-3 text-muted-foreground opacity-60 shrink-0" />
                                </div>
                            </PriceSourcePopover>
                            {menuItem?.effective_cash_price && menuItem.effective_cash_price !== menuItem.effective_price && (
                                <div className="whitespace-nowrap text-xs text-muted-foreground sm:text-sm">
                                    <span className="hidden sm:inline">Cash: $</span>
                                    <span className="sm:hidden">cash </span>
                                    {menuItem.effective_cash_price.toFixed(2)}
                                </div>
                            )}
                        </div>
                        {!isSelectionMode && (
                            <div onClick={(event) => event.stopPropagation()}>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full"
                                            disabled={stockActionBusy}
                                            aria-label={`Actions for ${menuItem?.name || 'item'}`}
                                        >
                                            {stockActionBusy
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <MoreHorizontal className="h-4 w-4" />}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <DropdownMenuItem onClick={onEdit}>
                                            <DollarSign className="mr-2 h-4 w-4" />
                                            Edit item price
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onClick}>
                                            <Info className="mr-2 h-4 w-4" />
                                            View item details
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {isOutOfStock && gatedLocationId ? (
                                            <DropdownMenuItem onClick={restoreStock} className="text-green-700">
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Restore item to stock
                                            </DropdownMenuItem>
                                        ) : (
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger disabled={!gatedLocationId}>
                                                    <CircleSlash className="mr-2 h-4 w-4" />
                                                    {gatedLocationId ? 'Mark out of stock' : 'Select a location first'}
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent>
                                                    <DropdownMenuItem onClick={() => markOutOfStock({ kind: 'hours', hours: 1 })}>
                                                        For 1 hour
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => markOutOfStock({ kind: 'hours', hours: 4 })}>
                                                        For 4 hours
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => markOutOfStock({ kind: 'end_of_day' })}>
                                                        Until end of day
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => markOutOfStock({ kind: 'until_manual' })}>
                                                        Until manually restored
                                                    </DropdownMenuItem>
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}
                    </div>
                </div>

                {/* Badges — full width below, free to wrap */}
                {(isOutOfStock ||
                    hasOutOfStockModifier ||
                    !menuItem?.effective_availability ||
                    (showLocationPricing && priceSource !== 'base')) && (
                    <div className="hidden flex-wrap items-center gap-1.5 min-w-0 sm:flex">
                        {hasOutOfStockModifier && (
                            <Badge
                                variant="outline"
                                className="text-[10px] gap-1 border-amber-300 bg-amber-50 text-amber-700"
                            >
                                <Layers className="h-2.5 w-2.5 shrink-0" />
                                <span>Modifier out of stock</span>
                            </Badge>
                        )}
                        {isOutOfStock ? (
                            <Badge
                                variant="outline"
                                className="text-[10px] gap-1 border-amber-300 bg-amber-50 text-amber-700"
                            >
                                <CircleSlash className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">
                                    {snoozeShortLabel(snoozedUntil as string)}
                                </span>
                            </Badge>
                        ) : (
                            !menuItem?.effective_availability && (
                                <Badge variant="destructive" className="text-[10px]">
                                    Unavailable
                                </Badge>
                            )
                        )}
                        {showLocationPricing && getPriceSourceBadge()}
                    </div>
                )}
            </div>
        </div>
    )
}

