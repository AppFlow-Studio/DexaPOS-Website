'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { Tag, Plus, Wand2, List, Table as TableIcon, Save, Info } from 'lucide-react'
import { MenuCategory, MenuCategoryItem } from '@/types/menu'
import { CategorySection } from './CategorySection'
import { CategoryTable } from './CategoryTable'
import { HiddenCategoriesCard } from './HiddenCategoriesCard'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'

interface MenuCategoriesTabProps {
    visibleCategories: MenuCategory[]
    hiddenCategories: MenuCategory[]
    expandedCategories: Set<string>
    selectedLocationId: string | null
    menuId: string
    isMenuLocationOwned?: boolean
    onToggleCategory: (categoryId: string) => void
    onExpandAll: () => void
    onCollapseAll: () => void
    onItemClick: (itemId: string) => void
    onToggleVisibility: (categoryId: string, isActive: boolean) => Promise<void>
    onResetOverride: (categoryId: string) => Promise<void>
    onEditItem: (item: MenuCategoryItem, category: MenuCategory, menuId: string) => void
    onAddCategory: () => void
    onNavigateToCategories: () => void
    refetchMenu: () => void
    categoryViewMode?: 'list' | 'table'
    onViewModeChange?: (mode: 'list' | 'table') => void
    onMoveCategoryUp?: (index: number) => void
    onMoveCategoryDown?: (index: number) => void
    onSaveCategoryOrder?: () => void
    hasCategoryOrderChanges?: boolean
    isSavingCategoryOrder?: boolean
    onRemoveCategory?: (categoryId: string) => void
}

export function MenuCategoriesTab({
    visibleCategories,
    hiddenCategories,
    expandedCategories,
    selectedLocationId,
    menuId,
    isMenuLocationOwned,
    onToggleCategory,
    onExpandAll,
    onCollapseAll,
    onItemClick,
    onToggleVisibility,
    onResetOverride,
    onEditItem,
    onAddCategory,
    onNavigateToCategories,
    refetchMenu,
    categoryViewMode = 'list',
    onViewModeChange,
    onMoveCategoryUp,
    onMoveCategoryDown,
    onSaveCategoryOrder,
    hasCategoryOrderChanges = false,
    isSavingCategoryOrder = false,
    onRemoveCategory,
}: MenuCategoriesTabProps) {
    const isAllLocations = !selectedLocationId || selectedLocationId === 'all'
    // Cannot add/remove categories when location-scoped viewing a global menu
    const canModifyCategories = isAllLocations || isMenuLocationOwned

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    {categoryViewMode === 'list' && (
                        <>
                            <Button variant="outline" size="sm" onClick={onExpandAll}>
                                Expand All
                            </Button>
                            <Button variant="outline" size="sm" onClick={onCollapseAll}>
                                Collapse All
                            </Button>
                        </>
                    )}
                    {onViewModeChange && (
                        <div className="flex items-center border rounded-md">
                            <Button
                                variant={categoryViewMode === 'list' ? 'default' : 'ghost'}
                                size="sm"
                                className="rounded-r-none"
                                onClick={() => onViewModeChange('list')}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={categoryViewMode === 'table' ? 'default' : 'ghost'}
                                size="sm"
                                className="rounded-l-none"
                                onClick={() => onViewModeChange('table')}
                            >
                                <TableIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                    {hasCategoryOrderChanges && onSaveCategoryOrder && (
                        <Button
                            variant="default"
                            size="sm"
                            onClick={onSaveCategoryOrder}
                            disabled={isSavingCategoryOrder}
                            className="gap-2"
                        >
                            <Save className="h-4 w-4" />
                            {isSavingCategoryOrder ? 'Saving...' : 'Save Order'}
                        </Button>
                    )}
                </div>
                <div className='flex items-center gap-2'>
                    {selectedLocationId !== 'all' && (
                        <Badge variant="secondary" className="text-xs">
                            Location view
                        </Badge>
                    )}

                    {canModifyCategories ? (
                        <Button
                            onClick={onAddCategory}
                            className="gap-1"
                        >
                            <Wand2 className="h-4 w-4" />
                            Add Category
                        </Button>
                    ) : (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div>
                                        <Button
                                            onClick={onAddCategory}
                                            className="gap-1"
                                            disabled={true}
                                        >
                                            <Wand2 className="h-4 w-4" />
                                            Add Category
                                        </Button>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Cannot add or remove categories from global menus when viewing a specific location. Switch to "All Locations" to modify categories.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>

            {/* Hidden Categories */}
            <HiddenCategoriesCard menuId={menuId} selectedLocationId={selectedLocationId} hiddenCategories={hiddenCategories} refetchMenu={refetchMenu} />

            {/* Category Sections */}
            {visibleCategories.length === 0 ? (
                <Empty
                    icon={Tag}
                    title="No categories"
                    description={
                        canModifyCategories
                            ? "Add categories to organize your menu items. Items are displayed within their categories."
                            : "This global menu's categories cannot be modified from a location view. Switch to 'All Locations' to add or remove categories."
                    }
                    action={
                        canModifyCategories ? (
                            <Button onClick={onAddCategory} className="gap-1">
                                <Wand2 className="h-4 w-4" />
                                Add Category
                            </Button>
                        ) : undefined
                    }
                />
            ) : categoryViewMode === 'table' ? (
                <>
                    <CategoryTable
                        categories={visibleCategories}
                        menuId={menuId}
                        selectedLocationId={selectedLocationId}
                        isMenuLocationOwned={isMenuLocationOwned}
                        onMoveUp={onMoveCategoryUp}
                        onMoveDown={onMoveCategoryDown}
                        onToggleVisibility={onToggleVisibility}
                        onResetOverride={onResetOverride}
                        onRemoveCategory={onRemoveCategory}
                        hasOrderChanges={hasCategoryOrderChanges}
                    />
                    {visibleCategories.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Info className="h-4 w-4" />
                            <span>This order determines how categories appear on the POS system</span>
                        </div>
                    )}
                </>
            ) : (
                <div className="space-y-4">
                    {visibleCategories.map((category) => (
                        <CategorySection
                            key={category.id}
                            category={category}
                            menuId={menuId}
                            isExpanded={expandedCategories.has(category.id)}
                            onToggle={() => onToggleCategory(category.id)}
                            onItemClick={onItemClick}
                            showLocationPricing={selectedLocationId !== 'all'}
                            locationId={selectedLocationId}
                            isMenuLocationOwned={isMenuLocationOwned}
                            canModifyCategories={canModifyCategories}
                            onToggleVisibility={onToggleVisibility}
                            onResetOverride={onResetOverride}
                            onEditItem={onEditItem}
                            onCategoryRemoved={refetchMenu}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

