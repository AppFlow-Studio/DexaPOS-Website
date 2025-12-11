'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
import { ChevronDown, ChevronRight, MapPin, Eye, EyeOff, RotateCcw, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuCategory, MenuCategoryItem } from '@/types/menu'
import { LevelIndicator, getEditingLevel } from '../LevelIndicator'
import { CategoryItemRow } from './CategoryItemRow'

interface CategorySectionProps {
    category: MenuCategory
    menuId: string
    isExpanded: boolean
    onToggle: () => void
    onItemClick: (itemId: string) => void
    showLocationPricing: boolean
    locationId?: string | null
    isMenuLocationOwned?: boolean
    onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>
    onResetOverride: (categoryId: string) => Promise<void>
    onEditItem: (item: MenuCategoryItem, category: MenuCategory) => void
}

export function CategorySection({
    category,
    menuId,
    isExpanded,
    onToggle,
    onItemClick,
    showLocationPricing,
    locationId,
    isMenuLocationOwned,
    onToggleVisibility,
    onResetOverride,
    onEditItem,
}: CategorySectionProps) {
    const itemCount = category.items?.length || 0
    const [isToggling, setIsToggling] = useState(false)
    const isAllLocations = !locationId || locationId === 'all'

    // Check if this category has a location-specific override
    const hasLocationOverride = category.category?.has_menu_category_override || false

    // Get editing level for this context
    const editingLevel = getEditingLevel({
        isAllLocations,
        menuId,
        categoryId: category.category_id,
        isMenuLocationOwned,
    })

    const handleToggleVisibility = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsToggling(true)
        try {
            await onToggleVisibility(category.category_id, !category.is_active)
        } finally {
            setIsToggling(false)
        }
    }

    const handleResetOverride = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsToggling(true)
        try {
            await onResetOverride(category.category_id)
        } finally {
            setIsToggling(false)
        }
    }

    return (
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <Card className={cn(
                "overflow-hidden transition-all",
                !category.is_active && "opacity-60"
            )}>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                    <div className="flex items-center justify-between">
                        <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-3 flex-1 cursor-pointer">
                                {isExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                )}
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-lg">
                                            {category.category?.name || 'Unnamed Category'}
                                        </CardTitle>
                                        {/* Location-scoped category badge */}
                                        {category.category?.location_id && category.category?.location_name && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-600 border-purple-200">
                                                            <MapPin className="h-3 w-3 mr-1" />
                                                            {category.category.location_name}
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>This category is scoped to {category.category.location_name}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                        {/* Global category indicator */}
                                        {!category.category?.location_id && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200">
                                                            <Globe className="h-3 w-3 mr-1" />
                                                            Global
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>This is a global category available to all locations</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                        {hasLocationOverride && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger>
                                                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                                            <MapPin className="h-3 w-3 mr-1" />
                                                            Override
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>This category has location-specific settings</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </div>
                                    {category.category?.description && (
                                        <CardDescription className="mt-1">
                                            {category.category.description}
                                        </CardDescription>
                                    )}
                                </div>
                            </div>
                        </CollapsibleTrigger>

                        {/* Controls */}
                        <div className="flex items-center gap-3">
                            {/* Level indicator */}
                            {showLocationPricing && (
                                <LevelIndicator level={editingLevel} variant="inline" />
                            )}

                            {/* Reset override button */}
                            {hasLocationOverride && !isAllLocations && (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={handleResetOverride}
                                                disabled={isToggling}
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Reset to global settings</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}

                            {/* Visibility toggle */}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={category.is_active}
                                                onCheckedChange={() => { }}
                                                onClick={handleToggleVisibility}
                                                disabled={isToggling}
                                            />
                                            {category.is_active ? (
                                                <Eye className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{category.is_active ? 'Hide' : 'Show'} this category {showLocationPricing ? 'at this location' : 'globally'}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                            <Badge variant="outline">
                                {itemCount} item{itemCount !== 1 ? 's' : ''}
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="pt-0">
                        {itemCount === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No items in this category
                            </div>
                        ) : (
                            <div className="divide-y">
                                {category.items?.map((item: MenuCategoryItem) => (
                                    <CategoryItemRow
                                        key={item.id}
                                        item={item}
                                        onClick={() => onItemClick(item.menu_item_id)}
                                        showLocationPricing={showLocationPricing}
                                        onEdit={() => onEditItem(item, category)}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    )
}

