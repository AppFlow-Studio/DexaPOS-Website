'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Utensils, Plus, Search, Grid3x3, List, Package, DollarSign, Edit3, Eye, MoreVertical, Tag, X, Filter, MapPin, Info } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCategories } from '../../hooks/useCategories'
import { useModifierGroups } from '../../hooks/useModifierGroups'
import { useUserInfo } from '../../../manage/hooks/useUserInfo.'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Empty } from '@/components/ui/empty'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { MenuItemsModel, CategoriesModel } from '@/types/db-modles'
import { ItemFormSheet } from '@/components/dashboard/menu/ItemFormSheet'
import { ItemPreviewCard, ItemPreviewRow } from '@/components/dashboard/menu/ItemPreviewCard'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLocationScopedMenuItemsWithCategories, useLocationContext } from '../../hooks/useLocationScoped'
import { NewEditItemFormSheet, EditItemWithOverrides } from '@/components/dashboard/menu/NewEditItemFormSheet'
import { LocationItem } from '@/types/merchant_locations'
import { LocationLibraryItem } from '@/types/menu'

// Helper to map LocationItem or LocationLibraryItem to EditItemWithOverrides
function mapLocationItemToEditItem(item: LocationItem | LocationLibraryItem | null): EditItemWithOverrides | undefined {
    if (!item) return undefined

    // Handle both LocationItem and LocationLibraryItem types
    const locationItem = item as LocationItem
    const libraryItem = item as LocationLibraryItem

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
        category_items: item.categories,
        effective_price: item.effective_price,
        effective_cash_price: item.effective_cash_price,
        // Handle modifier_groups from either type
        menu_item_modifier_groups: 'modifier_groups' in item ? libraryItem.modifier_groups : [],
        price_levels: {
            level_1_base: item.base_price,
            level_1_cash: item.base_cash_price,
            level_2_location_item: locationItem.location_override?.custom_price ?? null,
            level_2_location_item_cash: locationItem.location_override?.custom_cash_price ?? null,
            level_2_modifier: locationItem.location_override?.price_modifier ?? null,
            level_2_modifier_type: null,
            level_3_category: null,
            level_3_category_cash: null,
            level_4_location_category: null,
            level_4_location_category_cash: null,
            level_5_location_menu: null,
            level_5_location_menu_cash: null,
        },
    }
}

// interface MenuItemWithCategories extends MenuItemsModel {
//     menu_item_categories: Array<{
//         id: string
//         category: {
//             id: string
//             name: string
//         } | null
//     }>
//     // Location override fields
//     effective_price?: number
//     effective_cash_price?: number | null
//     has_price_override?: boolean
//     location_is_available?: boolean
//     global_price?: number
//     global_cash_price?: number | null
// }

export default function MenuItemsPage() {
    const { data: userInfo } = useUserInfo()
    const clerkOrgId = userInfo?.members?.[0]?.organizations?.id
    const router = useRouter()
    const queryClient = useQueryClient()
    const searchParams = useSearchParams()

    // Location context for scoped data
    const { isAllLocations, locationName, selectedLocationId } = useLocationContext()

    // Use location-scoped hook for items with effective prices
    const { data: items, isLoading, isError, refetch } = useLocationScopedMenuItemsWithCategories()

    const { data: categories } = useCategories(clerkOrgId || '')
    const { data: modifierGroups } = useModifierGroups(clerkOrgId)

    const [searchTerm, setSearchTerm] = useState('')
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<LocationItem | null>(null)
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
    const [showCategoryFilter, setShowCategoryFilter] = useState(false)

    // Read category filter from URL params
    useEffect(() => {
        const categoryParam = searchParams.get('category')
        if (categoryParam) {
            setSelectedCategoryId(categoryParam)
            setShowCategoryFilter(true)
        }
    }, [searchParams])

    const itemsList = useMemo(() => {
        return Array.isArray(items?.data) ? items.data as LocationItem[] : []
    }, [items?.data])

    // Filter items by search term and category
    const filteredItems = useMemo(() => {
        let filtered = itemsList

        // Filter by search term
        if (searchTerm) {
            filtered = filtered.filter(item =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        }

        // Filter by category
        if (selectedCategoryId) {
            if (selectedCategoryId === 'uncategorized') {
                // Show items with no categories
                filtered = filtered.filter(item =>
                    !item.categories?.length ||
                    item.categories?.every(mic => !mic.id)
                )
            } else {
                // Show items in the selected category
                filtered = filtered.filter(item =>
                    item.categories?.some(mic => mic.id === selectedCategoryId)
                )
            }
        }

        return filtered
    }, [itemsList, searchTerm, selectedCategoryId])

    // Get category counts for filter badges
    const categoryItemCounts = useMemo(() => {
        const counts: Record<string, number> = {}
        itemsList.forEach(item => {
            item.categories?.forEach(mic => {
                if (mic?.id) {
                    counts[mic.id] = (counts[mic.id] || 0) + 1
                }
            })
        })
        return counts
    }, [itemsList])

    // Items without any category
    const uncategorizedCount = useMemo(() => {
        return itemsList.filter(item => !item.categories?.length || item.categories.every(mic => !mic.id)).length
    }, [itemsList])

    const availableItems = itemsList.filter(i => i.base_availability).length
    const unavailableItems = itemsList.filter(i => !i.base_availability).length
    const avgPrice = itemsList.length > 0
        ? (itemsList.reduce((acc, i) => acc + i.effective_price, 0) / itemsList.length).toFixed(2)
        : '0.00'

    const handleQuickEdit = (item: LocationItem) => {
        setIsCreateSheetOpen(true)
        setEditingItem(item)
    }

    const handleViewDetails = (item: LocationItem) => {
        router.push(`/dashboard/menu/items/${item.id}`)
    }


    // Count items with price overrides
    const itemsWithOverrides = useMemo(() => {
        return itemsList.filter(i => i.has_location_override).length
    }, [itemsList])

    const categoriesList = Array.isArray(categories) ? categories : []
    const modifierGroupsList = Array.isArray(modifierGroups) ? modifierGroups : []
    const selectedCategory = categoriesList.find(c => c.id === selectedCategoryId)

    // Check for error state
    const hasError = items?.error || items?.success === false
    const errorMessage = items?.error || 'Error fetching menu items'

    // Show error state
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
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold tracking-tight">Menu Items</h2>
                        {/* Location scope indicator */}
                        <Badge
                            variant={isAllLocations ? "secondary" : "default"}
                            className={cn(
                                "gap-1.5 animate-in fade-in slide-in-from-left-2 duration-300",
                                !isAllLocations && "bg-blue-500/10 text-blue-600 border-blue-200"
                            )}
                        >
                            <MapPin className="h-3 w-3" />
                            {locationName}
                        </Badge>
                        {!isAllLocations && itemsWithOverrides > 0 && (
                            <Badge
                                variant="outline"
                                className="gap-1 bg-amber-500/10 text-amber-600 border-amber-200 animate-in fade-in slide-in-from-left-4 duration-300"
                            >
                                <Info className="h-3 w-3" />
                                {itemsWithOverrides} with local pricing
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        {isAllLocations
                            ? 'Manage all your menu items across all locations'
                            : `Viewing items for ${locationName} - prices may differ from global`}
                    </p>
                </div>
                <Button onClick={() => setIsCreateSheetOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Item
                </Button>
            </div>

            {/* Stats Overview */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                        <Utensils className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{itemsList.length}</div>
                        <p className="text-xs text-muted-foreground">
                            All items
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Available</CardTitle>
                        <Package className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{availableItems}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently available
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unavailable</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{unavailableItems}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently unavailable
                        </p>
                    </CardContent>
                </Card>
                <Card className="transition-all hover:shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Price</CardTitle>
                        <DollarSign className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-primary">${avgPrice}</div>
                        <p className="text-xs text-muted-foreground">
                            Average item price
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Items List */}
            <Card>
                <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>All Items</CardTitle>
                            <CardDescription>
                                {selectedCategoryId
                                    ? `${filteredItems.length} items in ${selectedCategoryId === 'uncategorized' ? 'uncategorized' : selectedCategory?.name || 'selected category'}`
                                    : 'Hover over items for quick actions'
                                }
                            </CardDescription>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search items..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 w-64"
                                />
                            </div>
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
                                    {selectedCategoryId && !showCategoryFilter && (
                                        <span className="max-w-[80px] truncate text-xs">
                                            {selectedCategoryId === 'uncategorized' ? 'Uncategorized' : selectedCategory?.name}
                                        </span>
                                    )}
                                </Button>
                            )}
                            <div className="flex items-center border rounded-md">
                                <Button
                                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-r-none"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <Grid3x3 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                                    size="sm"
                                    className="rounded-l-none"
                                    onClick={() => setViewMode('list')}
                                >
                                    <List className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Category Filter - Inline */}
                    {categoriesList.length > 0 && showCategoryFilter && (
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
                                                "h-7 text-xs",
                                                count === 0 && "opacity-50"
                                            )}
                                        >
                                            <Tag className="h-3 w-3 mr-1" />
                                            {category.name}
                                            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                                                {count}
                                            </Badge>
                                        </Button>
                                    )
                                })}
                                {uncategorizedCount > 0 && (
                                    <Button
                                        variant={selectedCategoryId === 'uncategorized' ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedCategoryId('uncategorized')}
                                        className="h-7 text-xs border-dashed"
                                    >
                                        Uncategorized
                                        <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                                            {uncategorizedCount}
                                        </Badge>
                                    </Button>
                                )}
                            </div>

                            {/* Active filter indicator with clear */}
                            {selectedCategoryId && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Filtered by:</span>
                                    <Badge variant="secondary" className="gap-1 pr-1">
                                        {selectedCategoryId === 'uncategorized'
                                            ? 'Uncategorized'
                                            : selectedCategory?.name || 'Unknown'
                                        }
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
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className={viewMode === 'grid' ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-3'}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                <Skeleton key={i} className={viewMode === 'grid' ? 'h-64' : 'h-20'} />
                            ))}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <Empty
                            icon={Utensils}
                            title={itemsList.length === 0 ? "No items yet" : selectedCategoryId ? "No items in this category" : "No items found"}
                            description={
                                itemsList.length === 0
                                    ? "Get started by creating your first menu item"
                                    : selectedCategoryId
                                        ? "Try selecting a different category or clear the filter"
                                        : "Try adjusting your search terms"
                            }
                            action={
                                itemsList.length === 0 ? (
                                    <Button onClick={() => setIsCreateSheetOpen(true)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Item
                                    </Button>
                                ) : selectedCategoryId ? (
                                    <Button variant="outline" onClick={() => setSelectedCategoryId(null)}>
                                        <X className="h-4 w-4 mr-2" />
                                        Clear Filter
                                    </Button>
                                ) : null
                            }
                        />
                    ) : viewMode === 'grid' ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredItems.map((item, index) => {
                                // Use effective price if available (location-scoped)
                                const displayPrice = item.effective_price ?? item.base_price
                                const displayCashPrice = item.effective_cash_price ?? item.base_cash_price
                                const hasOverride = item.has_location_override ?? false

                                return (
                                    <div
                                        key={item.id}
                                        className="group animate-in fade-in slide-in-from-bottom-4"
                                        style={{ animationDelay: `${index * 30}ms` }}
                                    >
                                        <div className="relative">
                                            <ItemPreviewCard
                                                name={item.name}
                                                description={item.description || undefined}
                                                price={displayPrice}
                                                cashPrice={displayCashPrice || undefined}
                                                image={item.image || undefined}
                                                availability={item.effective_availability ?? item.base_availability ?? true}
                                                className={cn(
                                                    "transition-all duration-300",
                                                    "group-hover:shadow-xl group-hover:scale-[1.02] group-hover:border-primary/50",
                                                    hasOverride && "ring-2 ring-amber-200"
                                                )}
                                            />
                                            {/* Location override indicator */}
                                            {hasOverride && (
                                                <div className="absolute top-2 right-2 z-10">
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 border-amber-200 gap-1"
                                                    >
                                                        <MapPin className="h-2.5 w-2.5" />
                                                        Local
                                                    </Badge>
                                                </div>
                                            )}
                                            {/* Global price strikethrough if different */}
                                            {hasOverride && item.base_price !== undefined && item.base_price !== displayPrice && (
                                                <div className="absolute top-2 left-2 z-10">
                                                    <span className="text-[10px] text-muted-foreground line-through bg-background/80 px-1 rounded">
                                                        ${item.base_price.toFixed(2)}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Category badges */}
                                            {item.categories && item.categories.length > 0 && (
                                                <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                                                    {item.categories.slice(0, 2).map((mic) => (
                                                        mic.id && (
                                                            <Badge
                                                                key={mic.id}
                                                                variant="secondary"
                                                                className="text-[10px] px-1.5 py-0 bg-background/80 backdrop-blur-sm"
                                                            >
                                                                {mic.name}
                                                            </Badge>
                                                        )
                                                    ))}
                                                    {item.categories.length > 2 && (
                                                        <Badge
                                                            variant="secondary"
                                                            className="text-[10px] px-1.5 py-0 bg-background/80 backdrop-blur-sm"
                                                        >
                                                            +{item.categories.length - 2}
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                            {/* Action buttons overlay */}
                                            <div className="absolute inset-x-0 -top-1 p-4 bg-gradient-to-b from-white/30 via-white/60 to-transparent rounded-t-lg opacity-0 group-hover:opacity-100 transition-all backdrop-blur-none group-hover:backdrop-blur-lg duration-300">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        className="h-8 bg-white/95 hover:bg-white cursor-pointer shadow-lg"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleQuickEdit(item)
                                                        }}
                                                    >
                                                        <Edit3 className="h-3.5 w-3.5 mr-1.5" />
                                                        Quick Edit
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="h-8 shadow-lg"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleViewDetails(item)
                                                        }}
                                                    >
                                                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                        Details
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredItems.map((item, index) => {
                                const displayPrice = item.effective_price ?? item.base_price
                                const hasOverride = item.has_location_override ?? false

                                return (
                                    <div
                                        key={item.id}
                                        className="group animate-in fade-in slide-in-from-left-4"
                                        style={{ animationDelay: `${index * 30}ms` }}
                                    >
                                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-card transition-all duration-200 hover:shadow-md hover:border-primary/30">
                                            {/* Image */}
                                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted/30 shrink-0">
                                                {item.image ? (
                                                    <img
                                                        src={item.image}
                                                        alt={item.name || 'Menu item'}
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
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h4 className={cn(
                                                            "font-medium truncate",
                                                            item.name ? "text-foreground" : "text-muted-foreground/50"
                                                        )}>
                                                            {item.name || 'Item Name'}
                                                        </h4>
                                                        {item.description && (
                                                            <p className="text-sm text-muted-foreground truncate">
                                                                {item.description}
                                                            </p>
                                                        )}
                                                        {/* Category tags */}
                                                        {item.categories && item.categories.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {item.categories.slice(0, 3).map((mic) => (
                                                                    mic.id && (
                                                                        <Badge
                                                                            key={mic.id}
                                                                            variant="outline"
                                                                            className="text-[10px] px-1.5 py-0"
                                                                        >
                                                                            {mic.name}
                                                                        </Badge>
                                                                    )
                                                                ))}
                                                                {item.categories.length > 3 && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="text-[10px] px-1.5 py-0"
                                                                    >
                                                                        +{item.categories.length - 3}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0 flex items-center gap-2">
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-semibold text-primary">
                                                                ${displayPrice > 0 ? displayPrice.toFixed(2) : '0.00'}
                                                            </span>
                                                            {hasOverride && item.base_price !== undefined && item.base_price !== displayPrice && (
                                                                <span className="text-[10px] text-muted-foreground line-through">
                                                                    ${item.base_price.toFixed(2)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {hasOverride && (
                                                            <Badge variant="outline" className="text-[10px] px-1 bg-amber-50 text-amber-700 border-amber-200">
                                                                <MapPin className="h-2.5 w-2.5" />
                                                            </Badge>
                                                        )}
                                                        {!(item.effective_availability ?? item.base_availability) && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                Off
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleQuickEdit(item)
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
                                                        handleViewDetails(item)
                                                    }}
                                                >
                                                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                    Details
                                                </Button>
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
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onClick={() => handleQuickEdit(item)}>
                                                        <Edit3 className="h-4 w-4 mr-2" />
                                                        Quick Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleViewDetails(item)}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        View Details
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create/Edit Bottom Sheet */}
            {/* <ItemFormSheet
                open={isCreateSheetOpen || !!editingItem}
                onOpenChange={(open) => {
                    if (!open) {
                        setIsCreateSheetOpen(false)
                        setEditingItem(null)
                    }
                }}
                clerkOrgId={clerkOrgId}
                categories={categoriesList}
                modifierGroups={modifierGroupsList}
                editItem={editingItem ? {
                    ...editingItem,
                    description: editingItem.description ?? undefined,
                    cash_price: editingItem.cash_price ?? undefined,
                    image: editingItem.image ?? undefined,
                    image_url: editingItem.image ?? undefined,
                    card_bg_color: editingItem.card_bg_color ?? undefined,
                    stock_tracking_mode: editingItem.stock_tracking_mode ?? undefined,
                    global_cash_price: editingItem.global_cash_price ?? undefined,
                } : undefined}
                onSuccess={() => {
                    setIsCreateSheetOpen(false)
                    setEditingItem(null)
                    queryClient.invalidateQueries({ queryKey: ['menu-items'] })
                }}
            /> */}
            {/* In Items Library page */}
            <NewEditItemFormSheet
                open={isCreateSheetOpen}
                onOpenChange={setIsCreateSheetOpen}
                clerkOrgId={clerkOrgId}
                editItem={mapLocationItemToEditItem(editingItem)}
                // No menuId = Items Library context
                categories={categories}
                modifierGroups={modifierGroups}
                onSuccess={() => {
                    setIsCreateSheetOpen(false)
                    setEditingItem(null)
                    refetch()
                }}
            />
        </div>
    )
}
