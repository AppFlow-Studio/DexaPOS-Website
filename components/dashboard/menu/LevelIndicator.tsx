'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Globe, MapPin, Tag, Layers, Menu } from 'lucide-react'

export type PricingLevel = 1 | 2 | 3 | 4 | 5

export interface LevelConfig {
    level: PricingLevel
    label: string
    shortLabel: string
    description: string
    icon: React.ReactNode
    colorClass: string
    bgClass: string
    borderClass: string
}

const LEVEL_CONFIGS: Record<PricingLevel, LevelConfig> = {
    1: {
        level: 1,
        label: 'Base Price',
        shortLabel: 'L1: Base',
        description: 'Global base price - applies to all locations unless overridden',
        icon: <Globe className="h-3 w-3" />,
        colorClass: 'text-slate-600',
        bgClass: 'bg-slate-100 dark:bg-slate-800',
        borderClass: 'border-slate-200 dark:border-slate-700',
    },
    2: {
        level: 2,
        label: 'Location Override',
        shortLabel: 'L2: Location',
        description: 'Location-specific price override for this item',
        icon: <MapPin className="h-3 w-3" />,
        colorClass: 'text-blue-600',
        bgClass: 'bg-blue-50 dark:bg-blue-950',
        borderClass: 'border-blue-200 dark:border-blue-800',
    },
    3: {
        level: 3,
        label: 'Category Price',
        shortLabel: 'L3: Category',
        description: 'Price set at the category level - applies when item is in this category',
        icon: <Tag className="h-3 w-3" />,
        colorClass: 'text-green-600',
        bgClass: 'bg-green-50 dark:bg-green-950',
        borderClass: 'border-green-200 dark:border-green-800',
    },
    4: {
        level: 4,
        label: 'Location + Category',
        shortLabel: 'L4: Loc+Cat',
        description: 'Location-specific price for this item within this category',
        icon: <Layers className="h-3 w-3" />,
        colorClass: 'text-purple-600',
        bgClass: 'bg-purple-50 dark:bg-purple-950',
        borderClass: 'border-purple-200 dark:border-purple-800',
    },
    5: {
        level: 5,
        label: 'Menu Override',
        shortLabel: 'L5: Menu',
        description: 'Price specific to this item in this category on this menu at this location',
        icon: <Menu className="h-3 w-3" />,
        colorClass: 'text-amber-600',
        bgClass: 'bg-amber-50 dark:bg-amber-950',
        borderClass: 'border-amber-200 dark:border-amber-800',
    },
}

export interface LevelIndicatorProps {
    level: PricingLevel
    variant?: 'badge' | 'pill' | 'inline' | 'full'
    showIcon?: boolean
    showTooltip?: boolean
    className?: string
}

export function LevelIndicator({
    level,
    variant = 'badge',
    showIcon = true,
    showTooltip = true,
    className,
}: LevelIndicatorProps) {
    const config = LEVEL_CONFIGS[level]

    const content = (
        <Badge
            variant="outline"
            className={cn(
                'gap-1.5 font-medium transition-colors',
                config.bgClass,
                config.colorClass,
                config.borderClass,
                variant === 'pill' && 'rounded-full px-3',
                variant === 'inline' && 'h-5 text-[10px] px-1.5',
                variant === 'full' && 'h-7 text-xs px-2.5',
                className
            )}
        >
            {showIcon && config.icon}
            {variant === 'inline' ? `L${level}` : config.shortLabel}
        </Badge>
    )

    if (!showTooltip) {
        return content
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    {content}
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                        <p className="font-semibold">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

// Helper function to get level from context
export function getEditingLevel({
    isAllLocations,
    menuId,
    categoryId,
    isMenuLocationOwned,
}: {
    isAllLocations: boolean
    menuId?: string | null
    categoryId?: string | null
    isMenuLocationOwned?: boolean
}): PricingLevel {
    // Level 1: Base - All locations, no menu, no category
    if (isAllLocations && !menuId && !categoryId) {
        return 1
    }

    // Level 2: Location - Specific location, no category context
    if (!isAllLocations && !categoryId) {
        return 2
    }

    // Level 3: Category - All locations, has category
    if (isAllLocations && categoryId && !menuId) {
        return 3
    }

    // Level 4: Location + Category - Specific location, has category, no menu
    if (!isAllLocations && categoryId && !menuId) {
        return 4
    }

    // Level 5: Location + Menu + Category - Specific location, global menu, has category
    if (!isAllLocations && menuId && categoryId && !isMenuLocationOwned) {
        return 5
    }

    // Location-owned menu with category - treated as Level 3 (they have full control)
    if (menuId && categoryId && isMenuLocationOwned) {
        return 3
    }

    // Default to level 1
    return 1
}

// Component to display current editing context
export interface EditingContextBannerProps {
    level: PricingLevel
    locationName?: string
    categoryName?: string
    menuName?: string
    className?: string
}

export function EditingContextBanner({
    level,
    locationName,
    categoryName,
    menuName,
    className,
}: EditingContextBannerProps) {
    const config = LEVEL_CONFIGS[level]

    const getContextDescription = () => {
        switch (level) {
            case 1:
                return 'Changes apply to all locations'
            case 2:
                return `Changes apply only to ${locationName || 'this location'}`
            case 3:
                return `Changes apply to ${categoryName || 'this category'} at all locations`
            case 4:
                return `Changes apply to ${categoryName || 'this category'} at ${locationName || 'this location'}`
            case 5:
                return `Changes apply to ${categoryName || 'this category'} in ${menuName || 'this menu'} at ${locationName || 'this location'}`
            default:
                return ''
        }
    }

    return (
        <div
            className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border',
                config.bgClass,
                config.borderClass,
                className
            )}
        >
            <div className={cn('p-2 rounded-full', config.bgClass)}>
                {config.icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className={cn('text-sm font-medium', config.colorClass)}>
                        {config.label}
                    </span>
                    <LevelIndicator level={level} variant="inline" showTooltip={false} />
                </div>
                <p className="text-xs text-muted-foreground truncate">
                    {getContextDescription()}
                </p>
            </div>
        </div>
    )
}

// Export helper for price source display
export function getPriceSourceLevel(priceSource: string): PricingLevel {
    switch (priceSource) {
        case 'base':
            return 1
        case 'location_item':
        case 'location_item_override':
            return 2
        case 'category':
            return 3
        case 'location_category':
        case 'location_category_override':
            return 4
        case 'location_menu':
        case 'location_menu_category_override':
            return 5
        default:
            return 1
    }
}

export { LEVEL_CONFIGS }

