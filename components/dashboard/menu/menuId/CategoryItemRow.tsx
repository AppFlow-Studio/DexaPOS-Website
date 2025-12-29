'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { Utensils, Star, DollarSign } from 'lucide-react'
import { MenuCategoryItem } from '@/types/menu'

interface CategoryItemRowProps {
    item: MenuCategoryItem
    onClick: () => void
    showLocationPricing: boolean
    onEdit: () => void
}

export function CategoryItemRow({
    item,
    onClick,
    showLocationPricing,
    onEdit
}: CategoryItemRowProps) {
    const menuItem = item.menu_item
    const priceSource = menuItem?.price_source || 'base'
    console.log('item', menuItem)
    const getPriceSourceBadge = () => {
        switch (priceSource) {
            case 'location_menu':
                return <Badge variant="default" className="text-xs">L5: Menu Override</Badge>
            case 'location_category':
                return <Badge variant="default" className="text-xs">L4: Location Category</Badge>
            case 'category':
                return <Badge variant="secondary" className="text-xs">L3: Category Price</Badge>
            case 'location_item':
                return <Badge variant="secondary" className="text-xs">L2: Location Base</Badge>
            default:
                return null
        }
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
                <div>
                    <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">
                            {menuItem?.effective_price?.toFixed(2) || '0.00'}
                        </span>
                    </div>
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

