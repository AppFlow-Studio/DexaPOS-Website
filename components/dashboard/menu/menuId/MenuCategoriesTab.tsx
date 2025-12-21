'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/components/ui/empty'
import { Tag, Plus, Wand2 } from 'lucide-react'
import { MenuCategory, MenuCategoryItem } from '@/types/menu'
import { CategorySection } from './CategorySection'
import { HiddenCategoriesCard } from './HiddenCategoriesCard'

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
    onEditItem: (item: MenuCategoryItem, category: MenuCategory) => void
    onAddCategory: () => void
    onNavigateToCategories: () => void
    refetchMenu: () => void
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
}: MenuCategoriesTabProps) {
    const isAllLocations = !selectedLocationId || selectedLocationId === 'all'
    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onExpandAll}>
                        Expand All
                    </Button>
                    <Button variant="outline" size="sm" onClick={onCollapseAll}>
                        Collapse All
                    </Button>
                </div>
                <div className='flex items-center gap-2'>
                    {selectedLocationId !== 'all' && (
                        <Badge variant="secondary" className="text-xs">
                            Location view
                        </Badge>
                    )}

                    <Button onClick={onAddCategory} className="gap-1">
                        <Wand2 className="h-4 w-4" />
                        Add Category
                    </Button>
                </div>
            </div>

            {/* Hidden Categories */}
            <HiddenCategoriesCard menuId={menuId} selectedLocationId={selectedLocationId} hiddenCategories={hiddenCategories} refetchMenu={refetchMenu} />

            {/* Category Sections */}
            {visibleCategories.length === 0 ? (
                <Empty
                    icon={Tag}
                    title="No categories"
                    description="Add categories to organize your menu items. Items are displayed within their categories."
                    action={
                        <Button onClick={onAddCategory} className="gap-1">
                            <Wand2 className="h-4 w-4" />
                            Add Category
                        </Button>
                    }
                />
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

