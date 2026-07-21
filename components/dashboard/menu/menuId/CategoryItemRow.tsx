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
import { Info, Utensils, Star, DollarSign, CircleSlash, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuCategoryItem } from '@/types/menu'
import { PriceSourcePopover } from '@/components/dashboard/menu/PriceSourcePopover'
import { ItemStockToggle } from '@/components/dashboard/menu/menuId/ItemStockToggle'
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
    const priceSource = menuItem?.price_source || 'base'
    const sourceLevel = priceSourceToLevel(priceSource)
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()

    // 86 / out-of-stock state. All rows share ONE useActiveSnoozes fetch (React
    // Query dedupes by key), so this is a single request per location, not per row.
    const clerkOrgId = useClerkOrgId()
    const gatedLocationId = useGatedLocationId()
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
                "flex items-center gap-2 sm:gap-4 py-4 px-1 sm:px-2 hover:bg-muted/50 cursor-pointer transition-colors rounded-lg min-w-0",
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

            {/* Item Image */}
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                {menuItem?.image ? (
                    <img
                        src={menuItem.image}
                        alt={menuItem?.name || ''}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <Utensils className="h-6 w-6 text-muted-foreground" />
                )}
            </div>

            {/* Details + price + badges. Name/desc and price share the top row;
                badges wrap onto their own full-width row below so they never
                collide with the price column on narrow screens. */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2 min-w-0">
                    {/* Name + description */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <h4 className="font-medium truncate">{menuItem?.name}</h4>
                            {item.is_featured && (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                            )}
                        </div>
                        {menuItem?.description && (
                            <p className="text-sm text-muted-foreground truncate">
                                {menuItem.description}
                            </p>
                        )}
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
                                    <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="font-semibold">
                                        {menuItem?.effective_price?.toFixed(2) || '0.00'}
                                    </span>
                                    <Info className="h-3 w-3 text-muted-foreground opacity-60 shrink-0" />
                                </div>
                            </PriceSourcePopover>
                            {menuItem?.effective_cash_price && menuItem.effective_cash_price !== menuItem.effective_price && (
                                <div className="text-sm text-muted-foreground whitespace-nowrap">
                                    Cash: ${menuItem.effective_cash_price.toFixed(2)}
                                </div>
                            )}
                        </div>
                        {!isSelectionMode && (
                            <>
                                <ItemStockToggle
                                    menuItemId={item.menu_item_id}
                                    clerkOrgId={clerkOrgId}
                                    locationId={gatedLocationId}
                                    isOutOfStock={isOutOfStock}
                                    itemName={menuItem?.name}
                                    image={menuItem?.image}
                                />
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="hidden sm:inline-flex h-8 w-8"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onEdit()
                                                }}
                                            >
                                                <DollarSign className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Edit state of this item in this menu/category context</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </>
                        )}
                    </div>
                </div>

                {/* Badges — full width below, free to wrap */}
                {(isOutOfStock ||
                    hasOutOfStockModifier ||
                    !menuItem?.effective_availability ||
                    (menuItem?.allergens && menuItem.allergens.length > 0) ||
                    (showLocationPricing && priceSource !== 'base')) && (
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
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
                        {menuItem?.allergens && menuItem.allergens.length > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                                {menuItem.allergens.length} allergen{menuItem.allergens.length !== 1 ? 's' : ''}
                            </Badge>
                        )}
                        {showLocationPricing && getPriceSourceBadge()}
                    </div>
                )}
            </div>
        </div>
    )
}

