'use client'
//TODO: Setup or remove the items detailed page 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Utensils, Plus, Search, Grid3x3, List, Package, DollarSign, Edit3, Eye,
    MoreVertical, Tag, X, Filter, MapPin, Info, ChevronDown, ChevronRight,
    Globe, Layers, Sparkles
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
import { useLocationScopedMenuItemsWithCategories, useLocationContext } from '../../hooks/useLocationScoped'
import { NewEditItemFormSheet, EditItemWithOverrides } from '@/components/dashboard/menu/NewEditItemFormSheet'
import { FlatItem } from '../../actions/menu-items-rpc'
import { CategoryWithItems } from '@/types/menu'
import { useLocationStore } from '@/stores/location-store'

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
    index = 0
}: {
    item: FlatItem
    onEdit: () => void
    onView: () => void
    index?: number
}) {
    const hasOverride = item.has_location_override
    const priceColors = PRICE_SOURCE_COLORS[item.price_source] || PRICE_SOURCE_COLORS.base

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
                            {item.effective_cash_price && item.effective_cash_price !== item.effective_price && (
                                <Badge variant="outline" className="text-xs">
                                    Cash: ${item.effective_cash_price.toFixed(2)}
                                </Badge>
                            )}
                        </div>
                    </div>
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
    index = 0
}: {
    item: FlatItem
    onEdit: () => void
    onView: () => void
    index?: number
}) {
    const hasOverride = item.has_location_override
    const priceColors = PRICE_SOURCE_COLORS[item.price_source] || PRICE_SOURCE_COLORS.base

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
                            {/* Category tags */}
                            {item.categories.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
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
                                </div>
                            )}
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
}: {
    category: { id: string; name: string; is_global: boolean; location_name?: string | null }
    items: FlatItem[]
    isExpanded: boolean
    onToggle: () => void
    onEditItem: (item: FlatItem) => void
    onViewItem: (item: FlatItem) => void
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
                                {items.map((item, idx) => (
                                    <ItemCard
                                        key={item.id}
                                        item={item}
                                        index={idx}
                                        onEdit={() => onEditItem(item)}
                                        onView={() => onViewItem(item)}
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
            </div>
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
                <Button onClick={() => router.push('/dashboard/menu/categories')} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Items to Categories
                </Button>
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
                            {itemsByCategory.map((group) => (
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
                                />
                            ))}
                        </div>
                    ) : viewMode === 'grid' ? (
                        // Grid View
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {filteredItems.map((item, index) => (
                                <ItemCard
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    onEdit={() => handleQuickEdit(item)}
                                    onView={() => handleViewDetails(item)}
                                />
                            ))}
                        </div>
                    ) : (
                        // List View
                        <div className="space-y-2">
                            {filteredItems.map((item, index) => (
                                <ItemRow
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    onEdit={() => handleQuickEdit(item)}
                                    onView={() => handleViewDetails(item)}
                                />
                            ))}
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
        </div>
    )
}
