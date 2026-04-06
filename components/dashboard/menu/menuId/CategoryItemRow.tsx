'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { Info, Utensils, Star, DollarSign } from 'lucide-react'
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
} from '@/stores/location-store'

interface CategoryItemRowProps {
    item: MenuCategoryItem
    onClick: () => void
    showLocationPricing: boolean
    onEdit: () => void
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
    onEdit
}: CategoryItemRowProps) {
    const menuItem = item.menu_item
    const priceSource = menuItem?.price_source || 'base'
    const sourceLevel = priceSourceToLevel(priceSource)
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()

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
                className={`text-[10px] gap-1 border ${colors.text} ${colors.bg} ${colors.border}`}
            >
                <Icon className="h-2.5 w-2.5" />
                {label}
            </Badge>
        )
    }

    return (
        <div
            className="flex items-center gap-4 py-4 px-2 hover:bg-muted/50 cursor-pointer transition-colors rounded-lg"
            onClick={onEdit}
        >
            {/* Item Image */}
            <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
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

            {/* Item Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{menuItem?.name}</h4>
                    {item.is_featured && (
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                </div>
                {menuItem?.description && (
                    <p className="text-sm text-muted-foreground truncate">
                        {menuItem.description}
                    </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                    {menuItem?.allergens && menuItem.allergens.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                            {menuItem.allergens.length} allergen{menuItem.allergens.length !== 1 ? 's' : ''}
                        </Badge>
                    )}
                    {showLocationPricing && getPriceSourceBadge()}
                </div>
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0 flex items-center gap-2">
                <div onClick={(e) => e.stopPropagation()}>
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
                        <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">
                                {menuItem?.effective_price?.toFixed(2) || '0.00'}
                            </span>
                            <Info className="h-3 w-3 text-muted-foreground opacity-60" />
                        </div>
                    </PriceSourcePopover>
                    {menuItem?.effective_cash_price && menuItem.effective_cash_price !== menuItem.effective_price && (
                        <div className="text-sm text-muted-foreground">
                            Cash: ${menuItem.effective_cash_price.toFixed(2)}
                        </div>
                    )}
                    {!menuItem?.effective_availability && (
                        <Badge variant="destructive" className="text-xs mt-1">
                            Unavailable
                        </Badge>
                    )}
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
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
            </div>
        </div>
    )
}

