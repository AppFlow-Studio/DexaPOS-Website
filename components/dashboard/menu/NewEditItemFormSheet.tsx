// components/dashboard/menus/NewEditItemFormSheet.tsx

'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
} from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { ItemPreviewCard } from './ItemPreviewCard'
import {
    ChevronDown,
    ChevronRight,
    DollarSign,
    Image as ImageIcon,
    Tag,
    Layers,
    Settings2,
    AlertCircle,
    Sparkles,
    MapPin,
    RotateCcw,
    Info,
    Globe,
    Building2,
    Menu as MenuIcon,
    CheckCircle2,
    Plus,
    X,
    Grip,
    Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    updateItemOverride,
    createMenuItem,
    resetItemToLevel,
    type UpdateItemParams
} from '@/app/dashboard/actions/menu-items-rpc'
import { CategoriesModel, ModifierGroupsModel, ModifierGroupItemsModel } from '@/types/db-modles'
import { useLocationStore, useIsAllLocations } from '@/stores/location-store'
import ModifierItemRow, { ExtendedModifierItem } from './ModifierItemRow'
import { LocationLibraryItem, ModifierGroup, ModifierItem } from '@/types/menu'
import { LevelIndicator, EditingContextBanner, getEditingLevel, type PricingLevel } from './LevelIndicator'

// ============================================================================
// TYPES
// ============================================================================

interface PriceLevels {
    level_1_base: number
    level_1_cash: number | null
    level_2_location_item: number | null
    level_2_location_item_cash?: number | null
    level_2_modifier: number | null
    level_2_modifier_type: 'add' | 'percent' | null
    level_3_category: number | null             // NEW: Category price
    level_3_category_cash?: number | null
    level_4_location_category: number | null    // NEW: Location + Category
    level_4_location_category_cash?: number | null
    level_5_location_menu: number | null        // NEW: Location + Menu + Category
    level_5_location_menu_cash?: number | null
}

export interface EditItemWithOverrides {
    id: string
    name: string
    description?: string
    price: number
    cash_price?: number | null
    image?: string
    image_url?: string
    availability: boolean
    allergens?: string[]
    card_bg_color?: string
    stock_tracking_mode?: string
    meal_types?: string[]
    /** @deprecated Use category_items instead */
    menu_item_categories?: Array<{ category_id: string; category?: { id: string; name: string } }>
    // Support multiple formats: full category_items from DB, or simple { id, name } from RPC
    category_items?: Array<
        | { category_id: string; custom_price?: number | null; category?: { id: string; name: string } }
        | { id: string; name: string }
    >
    // Support multiple formats: junction table format or direct ModifierGroup[]
    menu_item_modifier_groups?: Array<
        | { modifier_group_id: string; modifier_groups?: { id: string; name: string } }
        | ModifierGroup
    >

    // Price level data (5-level cascade)
    price_levels?: PriceLevels
    effective_price?: number
    effective_cash_price?: number | null
    current_level?: 1 | 2 | 3 | 4 | 5

    // Override flags for 5-level cascade
    has_location_item_override?: boolean
    has_category_override?: boolean           // NEW: L3
    has_location_category_override?: boolean  // NEW: L4
    has_location_menu_override?: boolean      // L5

    // Override data
    location_item_override?: { id: string; custom_price?: number | null; custom_cash_price?: number | null }
    category_item?: { id: string; custom_price?: number | null; custom_cash_price?: number | null }
    location_category_override?: { id: string; custom_price?: number | null; custom_cash_price?: number | null }
    location_menu_override?: { id: string; custom_price?: number | null; custom_cash_price?: number | null }
}

interface NewEditItemFormSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    clerkOrgId: string | undefined
    categories?: CategoriesModel[]
    modifierGroups?: (ModifierGroupsModel & { modifier_group_items: ModifierGroupItemsModel[] })[]
    onSuccess?: () => void

    // Item data
    editItem?: EditItemWithOverrides

    // Context - IMPORTANT: This determines which table gets updated
    menuId?: string | null           // null = Items Library, string = within a menu
    categoryId?: string | null       // null = no category context, string = within a category
    categoryName?: string            // For display purposes
    menuName?: string                // For display purposes
    isMenuLocationOwned?: boolean    // Is the menu a location-specific menu (Level 5)?
}

// Form schema
const itemSchema = z.object({
    name: z.string().min(2, 'Item name must be at least 2 characters').max(100, 'Item name must be less than 100 characters'),
    description: z.string().max(500, 'Description must be less than 500 characters').optional(),
    price: z.number().min(0, 'Price must be positive'),
    cash_price: z.number().min(0, 'Cash price must be positive').optional().nullable(),
    image_url: z.string().optional(),
    availability: z.boolean().default(true),
    allergens: z.array(z.string()).default([]),
    card_bg_color: z.string().optional().nullable(),
    stock_tracking_mode: z.enum(['in_stock', 'out_of_stock', 'quantity']).default('in_stock'),
})

type ItemFormValues = z.infer<typeof itemSchema>

const COMMON_ALLERGENS = [
    'Dairy', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame'
]

// ============================================================================
// HELPER: Determine editing context
// ============================================================================

type EditingContext = {
    level: 1 | 2 | 3 | 4 | 5
    table: string
    description: string
    canEditBaseFields: boolean
    priceLabel: string
    resetToLevel: 1 | 2 | 3 | 4 | 5 | null
    resetLabel: string | null
}

function getEditingContext(
    isAllLocations: boolean,
    menuId: string | null | undefined,
    categoryId: string | null | undefined,
    isMenuLocationOwned: boolean | undefined
): EditingContext {
    // Items Library + All Locations + No Category = Level 1 (Global Base)
    if (!menuId && !categoryId && isAllLocations) {
        return {
            level: 1,
            table: 'menu_items',
            description: 'Editing global item. Changes affect all locations and menus.',
            canEditBaseFields: true,
            priceLabel: 'Base Price',
            resetToLevel: null,
            resetLabel: null,
        }
    }

    // Items Library + Location Selected + No Category = Level 2 (Location Item Override)
    if (!menuId && !categoryId && !isAllLocations) {
        return {
            level: 2,
            table: 'location_item_overrides',
            description: 'Editing location pricing. This price applies to ALL menus at this location.',
            canEditBaseFields: false,
            priceLabel: 'Location Base Price',
            resetToLevel: 1,
            resetLabel: 'Reset to Global',
        }
    }

    // Category context + All Locations = Level 3 (Category Price)
    if (categoryId && isAllLocations && !menuId) {
        return {
            level: 3,
            table: 'category_items',
            description: 'Editing category-specific pricing. This price applies at all locations for this category.',
            canEditBaseFields: false,
            priceLabel: 'Category Price',
            resetToLevel: 1,
            resetLabel: 'Reset to Base Price',
        }
    }

    // Category context + Location Selected = Level 4 (Location + Category)
    if (categoryId && !isAllLocations && !menuId) {
        return {
            level: 4,
            table: 'location_category_item_overrides',
            description: 'Editing location category pricing. This price applies to this category at this location.',
            canEditBaseFields: false,
            priceLabel: 'Location Category Price',
            resetToLevel: 3,
            resetLabel: 'Reset to Category Price',
        }
    }

    // Menu + Category + All Locations = Level 3 (Category in menu context)
    if (menuId && categoryId && isAllLocations) {
        return {
            level: 3,
            table: 'category_items',
            description: 'Editing category pricing for this menu. This price applies at all locations.',
            canEditBaseFields: false,
            priceLabel: 'Category Price',
            resetToLevel: 1,
            resetLabel: 'Reset to Base Price',
        }
    }

    // Menu + Category + Location (Location-owned menu) = Level 5
    if (menuId && categoryId && !isAllLocations && isMenuLocationOwned) {
        return {
            level: 5,
            table: 'location_menu_item_overrides',
            description: 'Editing your location\'s menu. You have full control over this pricing.',
            canEditBaseFields: false,
            priceLabel: 'Your Menu Price',
            resetToLevel: 4,
            resetLabel: 'Reset to Location Category',
        }
    }

    // Menu + Category + Location (Global Menu) = Level 5 (Location + Menu + Category)
    if (menuId && categoryId && !isAllLocations && !isMenuLocationOwned) {
        return {
            level: 5,
            table: 'location_menu_item_overrides',
            description: 'Editing this menu at your location only. Other locations are not affected.',
            canEditBaseFields: false,
            priceLabel: 'Location Menu Price',
            resetToLevel: 4,
            resetLabel: 'Reset to Location Category',
        }
    }

    // Fallback
    return {
        level: 1,
        table: 'menu_items',
        description: 'Editing item.',
        canEditBaseFields: true,
        priceLabel: 'Price',
        resetToLevel: null,
        resetLabel: null,
    }
}

// ============================================================================
// EDITING CONTEXT INDICATOR
// ============================================================================

const LEVEL_INFO = {
    1: {
        name: 'Global Base',
        icon: Globe,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        description: 'Base item price that applies everywhere by default.',
        affects: 'All locations and all menus',
    },
    2: {
        name: 'Location Override',
        icon: Building2,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        description: 'Location-specific base price that overrides the global price.',
        affects: 'All menus at this location',
    },
    3: {
        name: 'Menu Override',
        icon: MenuIcon,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        description: 'Menu-specific price that applies when this menu is used.',
        affects: 'This menu at all locations',
    },
    4: {
        name: 'Location + Menu',
        icon: MapPin,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        description: 'Price specific to this menu at this location only.',
        affects: 'This menu at this location only',
    },
    5: {
        name: 'Location Menu Owner',
        icon: Sparkles,
        color: 'text-pink-600',
        bgColor: 'bg-pink-50',
        borderColor: 'border-pink-200',
        description: 'This is your location\'s own menu - you have full control.',
        affects: 'Your menu at your location',
    },
} as const

function EditingContextIndicator({ context }: { context: EditingContext }) {
    const [isOpen, setIsOpen] = React.useState(false)
    const levelInfo = LEVEL_INFO[context.level]
    const Icon = levelInfo.icon

    return (
        <div className="relative">
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-help hover:shadow-sm",
                    levelInfo.bgColor,
                    levelInfo.borderColor,
                    levelInfo.color
                )}
                onMouseEnter={() => setIsOpen(true)}
                onMouseLeave={() => setIsOpen(false)}
            >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">
                    {levelInfo.name}
                </span>
                <Info className="h-3.5 w-3.5 opacity-60" />
            </div>

            {/* Hover Card */}
            {isOpen && (
                <div
                    className="absolute bottom-full left-0 mb-2 w-80 p-4 bg-background border rounded-lg shadow-xl z-50 animate-in fade-in-0 zoom-in-95 duration-150"
                    onMouseEnter={() => setIsOpen(true)}
                    onMouseLeave={() => setIsOpen(false)}
                >
                    <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                                levelInfo.bgColor
                            )}>
                                <Icon className={cn("h-4 w-4", levelInfo.color)} />
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm">{levelInfo.name}</h4>
                                <p className="text-xs text-muted-foreground">Level {context.level} Pricing</p>
                            </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-muted-foreground">
                            {levelInfo.description}
                        </p>

                        {/* Affects */}
                        <div className="rounded-lg bg-muted/50 p-2.5">
                            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Changes will affect:</p>
                            <p className="text-xs font-medium">{levelInfo.affects}</p>
                        </div>

                        {/* Price Hierarchy - Compact */}
                        <div className="space-y-1.5">
                            <p className="text-[11px] font-medium text-muted-foreground">Price Hierarchy:</p>
                            <div className="flex flex-wrap gap-1">
                                {[1, 2, 3, 4, 5].map((level) => {
                                    const info = LEVEL_INFO[level as keyof typeof LEVEL_INFO]
                                    const LevelIcon = info.icon
                                    const isCurrentLevel = level === context.level

                                    return (
                                        <div
                                            key={level}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-1 rounded text-[10px]",
                                                isCurrentLevel
                                                    ? cn(info.bgColor, info.borderColor, "border", info.color, "font-medium")
                                                    : "bg-muted/30 text-muted-foreground"
                                            )}
                                        >
                                            <LevelIcon className="h-3 w-3" />
                                            <span>{level}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Reset info */}
                        {context.resetLabel && (
                            <div className="pt-2 border-t flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <RotateCcw className="h-3 w-3" />
                                <span>"{context.resetLabel}" removes this override</span>
                            </div>
                        )}
                    </div>

                    {/* Arrow */}
                    <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-background border-b border-r rotate-45" />
                </div>
            )}
        </div>
    )
}

// ============================================================================
// MODIFIER GROUP SEARCH LIST
// ============================================================================

interface ModifierGroupSearchListProps {
    availableGroups: (ModifierGroupsModel & { modifier_group_items: ModifierGroupItemsModel[] })[]
    onSelect: (groupId: string) => void
}

function ModifierGroupSearchList({ availableGroups, onSelect }: ModifierGroupSearchListProps) {
    const [searchQuery, setSearchQuery] = React.useState('')

    const filteredGroups = React.useMemo(() => {
        if (!searchQuery.trim()) return availableGroups
        const query = searchQuery.toLowerCase()
        return availableGroups.filter(group =>
            group.name.toLowerCase().includes(query) ||
            group.description?.toLowerCase().includes(query)
        )
    }, [availableGroups, searchQuery])

    return (
        <div className="rounded-lg border bg-muted/30 overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b bg-background/50">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search modifier groups..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-9 pr-3 rounded-md border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Results */}
            <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
                {filteredGroups.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        {searchQuery ? (
                            <>
                                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p>No modifier groups match "{searchQuery}"</p>
                            </>
                        ) : (
                            <p>No available modifier groups</p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
                            {searchQuery ? `${filteredGroups.length} result${filteredGroups.length !== 1 ? 's' : ''}` : 'Available Modifier Groups'}
                        </div>
                        {filteredGroups.map((group) => (
                            <button
                                key={group.id}
                                type="button"
                                onClick={() => onSelect(group.id)}
                                className="w-full p-2.5 rounded-md bg-background hover:bg-accent transition-colors text-left flex items-center gap-3 group"
                            >
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 group-hover:bg-purple-100 transition-colors">
                                    <Layers className="h-4 w-4 text-muted-foreground group-hover:text-purple-600 transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {group.name}
                                        {group.is_required && (
                                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                                Required
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {group.modifier_group_items?.length || 0} options
                                    </div>
                                </div>
                                <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </button>
                        ))}
                    </>
                )}
            </div>
        </div>
    )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function NewEditItemFormSheet({
    open,
    onOpenChange,
    clerkOrgId,
    categories = [],
    modifierGroups = [],
    onSuccess,
    editItem,
    menuId,
    categoryId,
    categoryName,
    menuName,
    isMenuLocationOwned = false,
}: NewEditItemFormSheetProps) {
    const queryClient = useQueryClient()
    const { selectedLocationId, locations } = useLocationStore()
    const isAllLocations = useIsAllLocations()

    const [selectedCategories, setSelectedCategories] = React.useState<string[]>([])
    const [selectedModifiers, setSelectedModifiers] = React.useState<string[]>([])
    const [expandedSections, setExpandedSections] = React.useState({
        pricing: true,
        categories: false,
        modifiers: false,
        allergens: false,
        advanced: false,
    })
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [isResetting, setIsResetting] = React.useState(false)
    const [showAddModifier, setShowAddModifier] = React.useState(false)

    // Get editing context based on current state (includes category for 5-level cascade)
    const editingContext = React.useMemo(() =>
        getEditingContext(isAllLocations, menuId, categoryId, isMenuLocationOwned),
        [isAllLocations, menuId, categoryId, isMenuLocationOwned]
    )

    // Get current location name
    const currentLocationName = React.useMemo(() => {
        if (isAllLocations) return 'All Locations'
        const location = locations.find(l => l.id === selectedLocationId)
        return location?.name || 'Unknown Location'
    }, [isAllLocations, selectedLocationId, locations])

    // Determine which price to show in the form based on context
    const getPriceForContext = React.useCallback(() => {
        if (!editItem) return { price: 0, cashPrice: null }

        const levels = editItem.price_levels

        // 5-level price cascade resolution
        switch (editingContext.level) {
            case 1: // Global Base
                return {
                    price: levels?.level_1_base ?? editItem.price,
                    cashPrice: levels?.level_1_cash ?? editItem.cash_price
                }
            case 2: // Location Item Override
                return {
                    price: levels?.level_2_location_item ?? levels?.level_1_base ?? editItem.price,
                    cashPrice: levels?.level_2_location_item_cash ?? levels?.level_1_cash ?? editItem.cash_price
                }
            case 3: // Category Price
                return {
                    price: levels?.level_3_category ?? levels?.level_1_base ?? editItem.price,
                    cashPrice: levels?.level_3_category_cash ?? levels?.level_1_cash ?? editItem.cash_price
                }
            case 4: // Location + Category
                return {
                    price: levels?.level_4_location_category ?? levels?.level_3_category ?? levels?.level_2_location_item ?? levels?.level_1_base ?? editItem.price,
                    cashPrice: levels?.level_4_location_category_cash ?? levels?.level_3_category_cash ?? levels?.level_2_location_item_cash ?? levels?.level_1_cash ?? editItem.cash_price
                }
            case 5: // Location + Menu + Category
                return {
                    price: levels?.level_5_location_menu ?? levels?.level_4_location_category ?? levels?.level_3_category ?? levels?.level_2_location_item ?? levels?.level_1_base ?? editItem.price,
                    cashPrice: levels?.level_5_location_menu_cash ?? levels?.level_4_location_category_cash ?? levels?.level_3_category_cash ?? levels?.level_2_location_item_cash ?? levels?.level_1_cash ?? editItem.cash_price
                }
            default:
                return { price: editItem.price, cashPrice: editItem.cash_price }
        }
    }, [editItem, editingContext.level])

    const form = useForm<ItemFormValues>({
        resolver: zodResolver(itemSchema),
        defaultValues: {
            name: '',
            description: '',
            price: 0,
            cash_price: undefined,
            image_url: '',
            availability: true,
            allergens: [],
            card_bg_color: '',
            stock_tracking_mode: 'in_stock',
        },
    })

    // Reset form when editItem or context changes
    React.useEffect(() => {
        if (editItem) {
            const { price, cashPrice } = getPriceForContext()

            form.reset({
                name: editItem.name || '',
                description: editItem.description || '',
                price: price,
                cash_price: cashPrice ?? undefined,
                image_url: editItem.image || editItem.image_url || '',
                availability: editItem.availability ?? true,
                allergens: editItem.allergens || [],
                card_bg_color: editItem.card_bg_color || '',
                stock_tracking_mode: (editItem.stock_tracking_mode as 'in_stock' | 'out_of_stock' | 'quantity') || 'in_stock',
            })

            // Support both old menu_item_categories and new category_items
            const categoryData = editItem.category_items || editItem.menu_item_categories
            if (categoryData) {
                setSelectedCategories(
                    categoryData
                        .map((c: any) => c.category_id || c.category?.id)
                        .filter(Boolean)
                )
            }
            if (editItem.menu_item_modifier_groups) {
                setSelectedModifiers(
                    editItem.menu_item_modifier_groups
                        .map((m: any) => {
                            // Handle different data structures:
                            // 1. { modifier_group_id: "xxx" } - assignment record
                            // 2. { modifier_group: { id: "xxx" } } - nested group
                            // 3. { id: "xxx", name: "..." } - the group itself
                            return m.modifier_group_id || m.modifier_group?.id || m.id
                        })
                        .filter(Boolean)
                )
            }
        } else {
            form.reset({
                name: '',
                description: '',
                price: 0,
                cash_price: undefined,
                image_url: '',
                availability: true,
                allergens: [],
                card_bg_color: '',
                stock_tracking_mode: 'in_stock',
            })
            setSelectedCategories([])
            setSelectedModifiers([])
        }
    }, [editItem, form, getPriceForContext])

    const watchedValues = form.watch()

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
    }

    const toggleCategory = (categoryId: string) => {
        setSelectedCategories(prev =>
            prev.includes(categoryId)
                ? prev.filter(id => id !== categoryId)
                : [...prev, categoryId]
        )
    }

    const toggleModifier = (modifierId: string) => {
        setSelectedModifiers(prev =>
            prev.includes(modifierId)
                ? prev.filter(id => id !== modifierId)
                : [...prev, modifierId]
        )
    }

    const toggleAllergen = (allergen: string) => {
        const current = form.getValues('allergens')
        if (current.includes(allergen)) {
            form.setValue('allergens', current.filter(a => a !== allergen))
        } else {
            form.setValue('allergens', [...current, allergen])
        }
    }

    // ========================================================================
    // RESET HANDLER
    // ========================================================================

    const handleReset = async () => {
        if (!editItem?.id || !editingContext.resetToLevel) return

        setIsResetting(true)
        try {
            const result = await resetItemToLevel(
                editItem.id,
                editingContext.resetToLevel,
                {
                    categoryId: categoryId || null,
                    menuId: menuId || null,
                    locationId: isAllLocations ? null : selectedLocationId
                }
            )

            if (!result.success) {
                toast.error('Reset Failed', { description: result.error })
                return
            }

            const levelLabels = {
                1: 'global base',
                2: 'location base',
                3: 'category',
                4: 'location category',
                5: 'menu',
            }
            toast.success('Reset Successful', {
                description: `Item now uses ${levelLabels[editingContext.resetToLevel]} pricing`
            })

            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            queryClient.invalidateQueries({ queryKey: ['menu-item', editItem.id] })
            queryClient.invalidateQueries({ queryKey: ['menus'] })
            queryClient.invalidateQueries({ queryKey: ['categories-with-items'] })
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error('Reset Failed', {
                description: 'Unable to reset item pricing.'
            })
        } finally {
            setIsResetting(false)
        }
    }

    // ========================================================================
    // SUBMIT HANDLER
    // ========================================================================

    const onSubmit = async (values: ItemFormValues) => {
        if (!clerkOrgId) {
            toast.error('Organization Not Found', {
                description: 'Please ensure you are logged into an organization.'
            })
            return
        }

        setIsSubmitting(true)
        try {
            let result

            if (editItem) {
                // Build update params based on context (includes category for 5-level cascade)
                const updateParams: UpdateItemParams = {
                    menuItemId: editItem.id,
                    categoryId: categoryId || null,  // NEW: Category context for L3/L4/L5
                    menuId: menuId || null,
                    locationId: isAllLocations ? null : selectedLocationId,
                    price: values.price,
                    cashPrice: values.cash_price ?? null,
                    availability: values.availability,
                }

                console.log('updateParams NEW EDIT ITEM FORM SHEET', updateParams)

                // Only include base fields if we can edit them (Level 1)
                if (editingContext.canEditBaseFields) {
                    updateParams.name = values.name
                    updateParams.description = values.description
                    updateParams.image = values.image_url
                    updateParams.allergens = values.allergens
                    updateParams.cardBgColor = values.card_bg_color ?? undefined
                    updateParams.stockTrackingMode = values.stock_tracking_mode
                }

                result = await updateItemOverride(updateParams)


            } else {
                // Create new item (always Level 1 - global)
                result = await createMenuItem(clerkOrgId, {
                    name: values.name,
                    description: values.description,
                    price: values.price,
                    cashPrice: values.cash_price ?? undefined,
                    image: values.image_url ?? undefined,
                    availability: values.availability,
                    allergens: values.allergens,
                    cardBgColor: values.card_bg_color ?? undefined,
                    stockTrackingMode: values.stock_tracking_mode,
                })
            }

            if (!result.success) {
                toast.error('Operation Failed', { description: result.error })
                return
            }

            // Success message based on context
            const levelMessages: Record<number, string> = {
                1: 'Global item updated',
                2: `Location pricing updated for ${currentLocationName}`,
                3: `Menu pricing updated for "${menuName}"`,
                4: `Menu pricing updated at ${currentLocationName}`,
                5: `Your menu pricing updated`,
            }

            toast.success(editItem ? 'Item Updated' : 'Item Created', {
                description: editItem
                    ? levelMessages[editingContext.level] || 'Item saved'
                    : `"${values.name}" has been added to your menu.`
            })

            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            queryClient.invalidateQueries({ queryKey: ['menu-item', editItem?.id] })
            queryClient.invalidateQueries({ queryKey: ['menus'] })

            form.reset()
            setSelectedCategories([])
            setSelectedModifiers([])
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error(editItem ? 'Update Failed' : 'Creation Failed', {
                description: 'Unable to save the menu item. Please try again.'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClose = () => {
        form.reset()
        setSelectedCategories([])
        setSelectedModifiers([])
        onOpenChange(false)
    }

    // ========================================================================
    // PRICE BREAKDOWN COMPONENT
    // ========================================================================

    const PriceBreakdown = () => {
        if (!editItem?.price_levels) return null

        const levels = editItem.price_levels
        const currentLevel = editingContext.level

        return (
            <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-dashed">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Price Hierarchy
                </div>

                {/* Level 1 - Global Base */}
                <PriceLevelRow
                    level={1}
                    label="Global Base"
                    icon={<Globe className="h-3 w-3" />}
                    price={levels.level_1_base}
                    cashPrice={levels.level_1_cash}
                    isCurrentLevel={currentLevel === 1}
                    isActive={levels.level_1_base !== null}
                />

                {/* Level 2 - Location Item (only if location selected) */}
                {!isAllLocations && (
                    <PriceLevelRow
                        level={2}
                        label="Location Base"
                        icon={<Building2 className="h-3 w-3" />}
                        price={levels.level_2_location_item}
                        cashPrice={levels.level_2_location_item_cash}
                        modifier={levels.level_2_modifier}
                        modifierType={levels.level_2_modifier_type}
                        isCurrentLevel={currentLevel === 2}
                        isActive={levels.level_2_location_item !== null || levels.level_2_modifier !== null}
                        isOverride
                    />
                )}

                {/* Level 3 - Category Price */}
                {categoryId && (
                    <PriceLevelRow
                        level={3}
                        label={`Category: ${categoryName || 'Current'}`}
                        icon={<Tag className="h-3 w-3" />}
                        price={levels.level_3_category}
                        cashPrice={levels.level_3_category_cash}
                        isCurrentLevel={currentLevel === 3}
                        isActive={levels.level_3_category !== null}
                        isOverride
                    />
                )}

                {/* Level 4 - Location + Category */}
                {categoryId && !isAllLocations && (
                    <PriceLevelRow
                        level={4}
                        label="Location + Category"
                        icon={<MapPin className="h-3 w-3" />}
                        price={levels.level_4_location_category}
                        cashPrice={levels.level_4_location_category_cash}
                        isCurrentLevel={currentLevel === 4}
                        isActive={levels.level_4_location_category !== null}
                        isOverride
                    />
                )}

                {/* Level 5 - Location + Menu + Category */}
                {menuId && categoryId && !isAllLocations && (
                    <PriceLevelRow
                        level={5}
                        label={`Menu: ${menuName || 'Current'}`}
                        icon={<MenuIcon className="h-3 w-3" />}
                        price={levels.level_5_location_menu}
                        cashPrice={levels.level_5_location_menu_cash}
                        isCurrentLevel={currentLevel === 5}
                        isActive={levels.level_5_location_menu !== null}
                        isOverride
                    />
                )}

                {/* Effective Price */}
                <div className="pt-2 mt-2 border-t">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Effective Price:</span>
                        <span className="text-lg font-bold text-green-600">
                            ${editItem.effective_price?.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        )
    }

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <BottomSheet open={open} onOpenChange={handleClose}>
            <BottomSheetContent className="!h-[95vh]">
                <BottomSheetHeader>
                    <BottomSheetTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                        {editItem ? 'Edit Menu Item' : 'Create New Menu Item'}
                    </BottomSheetTitle>
                    <BottomSheetDescription className="space-y-2">
                        <span>{editingContext.description}</span>

                        {/* Context Badges */}
                        {editItem && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                {/* Level Badge */}
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "gap-1",
                                        editingContext.level === 1 && "bg-gray-100 text-gray-700 border-gray-300",
                                        editingContext.level === 2 && "bg-blue-100 text-blue-700 border-blue-300",
                                        editingContext.level === 3 && "bg-purple-100 text-purple-700 border-purple-300",
                                        editingContext.level === 4 && "bg-amber-100 text-amber-700 border-amber-300",
                                        editingContext.level === 5 && "bg-green-100 text-green-700 border-green-300",
                                    )}
                                >
                                    {editingContext.level === 1 && <Globe className="h-3 w-3" />}
                                    {editingContext.level === 2 && <Building2 className="h-3 w-3" />}
                                    {editingContext.level === 3 && <MenuIcon className="h-3 w-3" />}
                                    {editingContext.level === 4 && <MapPin className="h-3 w-3" />}
                                    {editingContext.level === 5 && <Sparkles className="h-3 w-3" />}
                                    Level {editingContext.level}
                                </Badge>

                                {/* Location Badge */}
                                {!isAllLocations && (
                                    <Badge variant="secondary" className="gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {currentLocationName}
                                    </Badge>
                                )}

                                {/* Menu Badge */}
                                {menuId && menuName && (
                                    <Badge variant="secondary" className="gap-1">
                                        <MenuIcon className="h-3 w-3" />
                                        {menuName}
                                        {isMenuLocationOwned && (
                                            <span className="text-xs">(Your Menu)</span>
                                        )}
                                    </Badge>
                                )}

                                {/* Override indicator */}
                                {editItem && (
                                    (editItem.has_location_item_override ||
                                        editItem.has_category_override ||
                                        editItem.has_location_category_override ||
                                        editItem.has_location_menu_override) && (
                                        <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-600 border-amber-200">
                                            <Info className="h-3 w-3" />
                                            Has overrides
                                        </Badge>
                                    )
                                )}
                            </div>
                        )}
                    </BottomSheetDescription>
                </BottomSheetHeader>

                <BottomSheetBody className="px-0">
                    <div className="flex flex-col lg:flex-row h-full">
                        {/* Form Section */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                            {/* Editing Context Banner - Shows which level user is editing */}
                            {editItem && editingContext.level > 1 && (
                                <EditingContextBanner
                                    level={editingContext.level as PricingLevel}
                                    locationName={!isAllLocations ? 'Current Location' : undefined}
                                    categoryName={categoryId ? categories.find(c => c.id === categoryId)?.name : undefined}
                                    menuName={menuId ? 'Current Menu' : undefined}
                                    className="mb-4"
                                />
                            )}

                            <Form {...form}>
                                <form id="item-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                                    {/* Basic Info Section - Only editable at Level 1 */}
                                    <div className="space-y-4">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                            <Settings2 className="h-4 w-4" />
                                            Basic Information
                                            {!editingContext.canEditBaseFields && editItem && (
                                                <Badge variant="outline" className="text-xs ml-2">
                                                    View Only
                                                </Badge>
                                            )}
                                        </h3>

                                        <FormField
                                            control={form.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Item Name *</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            placeholder="e.g., Crispy Chicken Wings"
                                                            className="h-12 text-lg"
                                                            disabled={!editingContext.canEditBaseFields && !!editItem}
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    {!editingContext.canEditBaseFields && editItem && (
                                                        <FormDescription className="text-amber-600">
                                                            Switch to "All Locations" to edit item details
                                                        </FormDescription>
                                                    )}
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="description"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Description</FormLabel>
                                                    <FormControl>
                                                        <textarea
                                                            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                                            placeholder="Describe your dish..."
                                                            disabled={!editingContext.canEditBaseFields && !!editItem}
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="image_url"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Image URL</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <ImageIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                            <Input
                                                                className="pl-10"
                                                                placeholder="https://example.com/image.jpg"
                                                                disabled={!editingContext.canEditBaseFields && !!editItem}
                                                                {...field}
                                                                value={field.value || ''}
                                                            />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Pricing Section */}
                                    <Collapsible open={expandedSections.pricing} onOpenChange={() => toggleSection('pricing')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <DollarSign className="h-4 w-4 text-green-500" />
                                                    Pricing
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            "text-xs ml-1",
                                                            editingContext.level === 1 && "bg-gray-100",
                                                            editingContext.level === 2 && "bg-blue-100 text-blue-700",
                                                            editingContext.level === 3 && "bg-purple-100 text-purple-700",
                                                            editingContext.level === 4 && "bg-amber-100 text-amber-700",
                                                            editingContext.level === 5 && "bg-green-100 text-green-700",
                                                        )}
                                                    >
                                                        {editingContext.priceLabel}
                                                    </Badge>
                                                </span>
                                                {expandedSections.pricing ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-4">

                                            {/* Price Breakdown - Show hierarchy */}
                                            {editItem && <PriceBreakdown />}

                                            {/* Price Inputs */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="price"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>{editingContext.priceLabel} *</FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        className={cn(
                                                                            "pl-7",
                                                                            editingContext.level > 1 && "border-blue-300 focus:ring-blue-500"
                                                                        )}
                                                                        placeholder="0.00"
                                                                        {...field}
                                                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                                    />
                                                                </div>
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                <FormField
                                                    control={form.control}
                                                    name="cash_price"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Cash Price</FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        className="pl-7"
                                                                        placeholder="Optional"
                                                                        {...field}
                                                                        value={field.value ?? ''}
                                                                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                                                    />
                                                                </div>
                                                            </FormControl>
                                                            <FormDescription>Optional cash discount</FormDescription>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            {/* Reset Button */}
                                            {editItem && editingContext.resetLabel && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleReset}
                                                    disabled={isResetting}
                                                    className="w-full gap-2"
                                                >
                                                    <RotateCcw className={cn("h-4 w-4", isResetting && "animate-spin")} />
                                                    {editingContext.resetLabel}
                                                </Button>
                                            )}

                                            {/* Context explanation */}
                                            {editItem && editingContext.level > 1 && (
                                                <div className="text-xs text-muted-foreground flex items-start gap-2 p-2 bg-blue-50 rounded-md border border-blue-100">
                                                    <Info className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                                    <span>
                                                        {editingContext.level === 2 && "This price will apply to ALL menus at this location, unless a more specific override exists."}
                                                        {editingContext.level === 3 && "This price will apply to all locations using this menu, unless they have a location-specific override."}
                                                        {editingContext.level === 4 && "This price only applies to this menu at this location."}
                                                        {editingContext.level === 5 && "You have full control over pricing in your location's menu."}
                                                    </span>
                                                </div>
                                            )}
                                        </CollapsibleContent>
                                    </Collapsible>

                                    {/* Categories Section - More Prominent for New Items */}
                                    <Collapsible
                                        open={expandedSections.categories}
                                        onOpenChange={() => toggleSection('categories')}
                                        defaultOpen={!editItem} // Open by default for new items
                                    >
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className={cn(
                                                    "flex items-center justify-between w-full p-3 rounded-lg transition-colors",
                                                    !editItem && selectedCategories.length === 0
                                                        ? "bg-amber-50 border border-amber-200 hover:bg-amber-100" // Highlight when no category selected for new items
                                                        : "bg-muted/50 hover:bg-muted"
                                                )}
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <Tag className={cn(
                                                        "h-4 w-4",
                                                        !editItem && selectedCategories.length === 0 ? "text-amber-600" : "text-blue-500"
                                                    )} />
                                                    Categories
                                                    {selectedCategories.length > 0 ? (
                                                        <Badge variant="secondary" className="ml-2">{selectedCategories.length}</Badge>
                                                    ) : !editItem && (
                                                        <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300">Select at least one</Badge>
                                                    )}
                                                </span>
                                                {expandedSections.categories ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-3">
                                            {/* Suggestion for new items */}
                                            {!editItem && selectedCategories.length === 0 && categories.length > 0 && (
                                                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                                                    <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                                    <div className="space-y-1">
                                                        <p className="text-amber-800 font-medium">Select a category for your item</p>
                                                        <p className="text-amber-700 text-xs">
                                                            Categories help organize your menu. Items without a category will be placed in "Uncategorized".
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {categories.length === 0 ? (
                                                <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                                                    <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                    <p>No categories available</p>
                                                    <p className="text-xs mt-1">Create categories first to organize your menu items.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {/* Category grid */}
                                                    <div className="flex flex-wrap gap-2">
                                                        {categories.map((category) => (
                                                            <button
                                                                key={category.id}
                                                                type="button"
                                                                onClick={() => toggleCategory(category.id)}
                                                                disabled={!editingContext.canEditBaseFields && !!editItem}
                                                                className={cn(
                                                                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                                                    "border hover:scale-105 active:scale-95",
                                                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                                                                    selectedCategories.includes(category.id)
                                                                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                                                                        : "bg-background border-border hover:border-primary/50"
                                                                )}
                                                            >
                                                                {category.name}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Skip option for new items */}
                                                    {!editItem && (
                                                        <div className="pt-2 border-t">
                                                            <button
                                                                type="button"
                                                                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                                                onClick={() => {
                                                                    // Clear all categories - item will go to "Uncategorized"
                                                                    setSelectedCategories([])
                                                                }}
                                                            >
                                                                <X className="h-3 w-3" />
                                                                Skip - Add to "Uncategorized"
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </CollapsibleContent>
                                    </Collapsible>

                                    {/* Modifiers Section */}
                                    <Collapsible open={expandedSections.modifiers} onOpenChange={() => toggleSection('modifiers')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <Layers className="h-4 w-4 text-purple-500" />
                                                    Modifier Groups
                                                    {selectedModifiers.length > 0 && (
                                                        <Badge variant="secondary" className="ml-2">{selectedModifiers.length}</Badge>
                                                    )}
                                                </span>
                                                {expandedSections.modifiers ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-4">
                                            {(() => {
                                                // Get enriched selected groups from editItem (has location-specific overrides)
                                                // These contain the actual modifier items with their current prices/availability
                                                const itemModifierGroups = editItem?.menu_item_modifier_groups || []
                                                // Build selected groups with enriched data from editItem
                                                const selectedGroups = itemModifierGroups
                                                    .map((assignment: { modifier_group_id?: string; modifier_groups?: { id: string; name: string }; id?: string; name?: string; description?: string | null; is_required?: boolean; min_selections?: number; max_selections?: number | null; is_active?: boolean; items?: ModifierItem[] }) => {
                                                        // The assignment may have modifier_group nested or be the group itself
                                                        const groupData = assignment as ModifierGroup
                                                        const groupId = (assignment as any).modifier_group_id || assignment.id

                                                        // Find the base group info from modifierGroups prop
                                                        const baseGroup = modifierGroups.find(g => g.id === groupId)

                                                        if (!baseGroup && !groupData.name) return null

                                                        // Merge: use editItem data for modifier_group_items (has overrides),
                                                        // fallback to base group for other properties
                                                        return {
                                                            id: groupId,
                                                            name: groupData.name || baseGroup?.name || 'Unknown Group',
                                                            description: groupData.description || baseGroup?.description,
                                                            is_required: groupData.is_required ?? baseGroup?.is_required ?? false,
                                                            min_selections: groupData.min_selections ?? baseGroup?.min_selections ?? 0,
                                                            max_selections: groupData.max_selections ?? baseGroup?.max_selections,
                                                            is_active: groupData.is_active ?? true,
                                                            // Use modifier_group_items from editItem - this has location-specific data
                                                            modifier_group_items: groupData.items || baseGroup?.modifier_group_items || [],
                                                        }
                                                    })
                                                    .filter(Boolean)


                                                // Get IDs of selected groups
                                                const selectedGroupIds = selectedGroups.map((g: any) => g.id)

                                                // Available groups are ones not in selectedGroupIds
                                                const availableGroups = modifierGroups.filter(g => !selectedGroupIds.includes(g.id))

                                                return (
                                                    <>
                                                        {/* Selected Modifier Groups */}
                                                        {selectedGroups.length === 0 ? (
                                                            <div className="text-center py-6 text-muted-foreground">
                                                                <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                                                <p className="text-sm">No modifier groups assigned</p>
                                                                <p className="text-xs mt-1">Add modifier groups to let customers customize this item</p>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {selectedGroups.map((group: any, index: number) => {
                                                                    const showItems = editingContext.level > 1

                                                                    return (
                                                                        <div
                                                                            key={group.id}
                                                                            className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden animate-in fade-in slide-in-from-top-2"
                                                                            style={{ animationDelay: `${index * 50}ms` }}
                                                                        >
                                                                            <div className="p-3 flex items-center gap-3">
                                                                                {/* Drag Handle (visual only for now) */}
                                                                                <div className="text-muted-foreground/50">
                                                                                    <Grip className="h-4 w-4" />
                                                                                </div>

                                                                                {/* Icon */}
                                                                                <div className="h-8 w-8 rounded-md bg-purple-100 flex items-center justify-center shrink-0">
                                                                                    <Layers className="h-4 w-4 text-purple-600" />
                                                                                </div>

                                                                                {/* Info */}
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="font-medium text-sm flex items-center gap-2">
                                                                                        {group.name}
                                                                                        {group.is_required && (
                                                                                            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                                                                                                Required
                                                                                            </Badge>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="text-xs text-muted-foreground">
                                                                                        {group.modifier_group_items?.length || 0} options •
                                                                                        Min: {group.min_selections || 0} •
                                                                                        Max: {group.max_selections || '∞'}
                                                                                    </div>
                                                                                </div>

                                                                                {/* Remove Button (Level 1 only) */}
                                                                                {editingContext.level === 1 && (
                                                                                    <Button
                                                                                        type="button"
                                                                                        variant="ghost"
                                                                                        size="icon"
                                                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                                                        onClick={() => toggleModifier(group.id)}
                                                                                    >
                                                                                        <X className="h-4 w-4" />
                                                                                    </Button>
                                                                                )}
                                                                            </div>

                                                                            {/* Items List (Drill Down for Location Managers) */}
                                                                            {showItems && group.modifier_group_items && group.modifier_group_items.length > 0 && (
                                                                                <div className="border-t bg-background/50 px-3 py-2 space-y-1">
                                                                                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                                                                                        Manage Options ({currentLocationName})
                                                                                    </div>
                                                                                    {group.modifier_group_items.map((item: any) => (
                                                                                        <ModifierItemRow
                                                                                            key={item.id}
                                                                                            item={item as ExtendedModifierItem}
                                                                                            locationId={selectedLocationId || ''}
                                                                                            onUpdate={() => {
                                                                                                queryClient.invalidateQueries({ queryKey: ['menu-items'] })
                                                                                                queryClient.invalidateQueries({ queryKey: ['menu-item', editItem?.id] })
                                                                                            }}
                                                                                        />
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Add Modifier Section (Level 1 only) */}
                                                        {editingContext.level === 2 && availableGroups.length > 0 && (
                                                            <div className="pt-2">
                                                                <Collapsible open={showAddModifier} onOpenChange={setShowAddModifier}>
                                                                    <CollapsibleTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            className={cn(
                                                                                "w-full p-3 rounded-lg border-2 border-dashed transition-all flex items-center justify-center gap-2",
                                                                                showAddModifier
                                                                                    ? "border-primary bg-primary/5 text-primary"
                                                                                    : "border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5"
                                                                            )}
                                                                        >
                                                                            <Plus className={cn(
                                                                                "h-4 w-4 transition-transform",
                                                                                showAddModifier && "rotate-45"
                                                                            )} />
                                                                            <span className="text-sm font-medium">
                                                                                {showAddModifier ? 'Cancel' : `Add Modifier Group (${availableGroups.length} available)`}
                                                                            </span>
                                                                        </button>
                                                                    </CollapsibleTrigger>
                                                                    <CollapsibleContent className="pt-3">
                                                                        <ModifierGroupSearchList
                                                                            availableGroups={availableGroups}
                                                                            onSelect={(groupId) => {
                                                                                toggleModifier(groupId)
                                                                                if (availableGroups.length === 1) {
                                                                                    setShowAddModifier(false)
                                                                                }
                                                                            }}
                                                                        />
                                                                    </CollapsibleContent>
                                                                </Collapsible>
                                                            </div>
                                                        )}

                                                        {/* No Available Modifiers Message */}
                                                        {editingContext.level === 1 && availableGroups.length === 0 && modifierGroups.length > 0 && (
                                                            <div className="text-center py-2 text-xs text-muted-foreground">
                                                                All modifier groups have been added
                                                            </div>
                                                        )}

                                                        {/* No Modifiers at All */}
                                                        {modifierGroups.length === 0 && (
                                                            <div className="text-center py-4 text-muted-foreground text-sm">
                                                                No modifier groups available in your organization.
                                                            </div>
                                                        )}
                                                    </>
                                                )
                                            })()}
                                        </CollapsibleContent>
                                    </Collapsible>

                                    {/* Allergens Section */}
                                    <Collapsible open={expandedSections.allergens} onOpenChange={() => toggleSection('allergens')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <AlertCircle className="h-4 w-4 text-orange-500" />
                                                    Allergens
                                                    {watchedValues.allergens?.length > 0 && (
                                                        <Badge variant="secondary" className="ml-2">{watchedValues.allergens.length}</Badge>
                                                    )}
                                                </span>
                                                {expandedSections.allergens ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4">
                                            <div className="flex flex-wrap gap-2">
                                                {COMMON_ALLERGENS.map((allergen) => (
                                                    <button
                                                        key={allergen}
                                                        type="button"
                                                        onClick={() => toggleAllergen(allergen)}
                                                        disabled={!editingContext.canEditBaseFields && !!editItem}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                                            "border hover:scale-105 active:scale-95",
                                                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
                                                            watchedValues.allergens?.includes(allergen)
                                                                ? "bg-orange-500 text-white border-orange-500 shadow-md"
                                                                : "bg-background border-border hover:border-orange-500/50"
                                                        )}
                                                    >
                                                        {allergen}
                                                    </button>
                                                ))}
                                            </div>
                                        </CollapsibleContent>
                                    </Collapsible>

                                    {/* Advanced Settings */}
                                    <Collapsible open={expandedSections.advanced} onOpenChange={() => toggleSection('advanced')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <Settings2 className="h-4 w-4 text-gray-500" />
                                                    Advanced Settings
                                                </span>
                                                {expandedSections.advanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="availability"
                                                render={({ field }) => (
                                                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                                        <div className="space-y-0.5">
                                                            <FormLabel className="text-base">
                                                                {editingContext.level === 1 ? 'Available for Sale' :
                                                                    editingContext.level === 2 ? 'Available at This Location' :
                                                                        'Available on This Menu'}
                                                            </FormLabel>
                                                            <FormDescription>
                                                                {editingContext.level === 1 && 'Master switch - affects all locations and menus'}
                                                                {editingContext.level === 2 && 'Toggle availability at this location'}
                                                                {editingContext.level >= 3 && 'Toggle availability on this category'}
                                                            </FormDescription>
                                                        </div>
                                                        <FormControl>
                                                            <button
                                                                type="button"
                                                                role="switch"
                                                                aria-checked={field.value}
                                                                onClick={() => field.onChange(!field.value)}
                                                                className={cn(
                                                                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                                    field.value ? "bg-primary" : "bg-muted"
                                                                )}
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                                                        field.value ? "translate-x-6" : "translate-x-1"
                                                                    )}
                                                                />
                                                            </button>
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="card_bg_color"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Card Background Color</FormLabel>
                                                        <FormControl>
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type="color"
                                                                    className="w-12 h-10 p-1 cursor-pointer"
                                                                    disabled={!editingContext.canEditBaseFields && !!editItem}
                                                                    {...field}
                                                                    value={field.value || '#ffffff'}
                                                                />
                                                                <Input
                                                                    placeholder="#000000"
                                                                    disabled={!editingContext.canEditBaseFields && !!editItem}
                                                                    {...field}
                                                                    value={field.value || ''}
                                                                />
                                                            </div>
                                                        </FormControl>
                                                        <FormDescription>Custom color for the item card in POS</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </CollapsibleContent>
                                    </Collapsible>
                                </form>
                            </Form>
                        </div>

                        {/* Preview Section */}
                        <div className="w-full lg:w-1/3 bg-muted/30 p-6 border-t lg:border-t-0 lg:border-l flex flex-col items-center">
                            {/* <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Live Preview
                            </h3> */}
                            <div className="sticky w-[80%] top-4">
                                <ItemPreviewCard
                                    name={watchedValues.name}
                                    description={watchedValues.description}
                                    price={watchedValues.price || 0}
                                    cashPrice={watchedValues.cash_price ?? undefined}
                                    image={watchedValues.image_url ?? undefined}
                                    categories={selectedCategories.map(id =>
                                        categories.find(c => c.id === id)?.name || ''
                                    ).filter(Boolean)}
                                    availability={watchedValues.availability}
                                    className="shadow-xl"
                                />

                                {/* Summary info */}
                                <div className="mt-6 space-y-2 text-sm">
                                    {editItem && (
                                        <EditingContextIndicator context={editingContext} />
                                    )}
                                    {selectedModifiers.length > 0 && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Layers className="h-4 w-4" />
                                            {selectedModifiers.length} modifier group{selectedModifiers.length !== 1 ? 's' : ''}
                                        </div>
                                    )}
                                    {watchedValues.allergens && watchedValues.allergens.length > 0 && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <AlertCircle className="h-4 w-4 text-orange-500" />
                                            Contains: {watchedValues.allergens.join(', ')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </BottomSheetBody>

                <BottomSheetFooter>
                    <Button type="button" variant="outline" onClick={handleClose} className="flex-1 lg:flex-none">
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="item-form"
                        disabled={isSubmitting}
                        className="flex-1 lg:flex-none lg:min-w-[150px]"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving...
                            </>
                        ) : editItem ? (
                            editingContext.level === 1 ? 'Save Changes' :
                                editingContext.level === 2 ? 'Save Location Price' :
                                    editingContext.level === 3 ? 'Save Menu Price' :
                                        editingContext.level === 4 ? 'Save Location Override' :
                                            'Save'
                        ) : 'Create Item'}
                    </Button>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}

// ============================================================================
// PRICE LEVEL ROW COMPONENT
// ============================================================================

interface PriceLevelRowProps {
    level: number
    label: string
    icon: React.ReactNode
    price: number | null
    cashPrice?: number | null
    modifier?: number | null
    modifierType?: 'add' | 'percent' | null
    isCurrentLevel: boolean
    isActive: boolean
    isOverride?: boolean
}

function PriceLevelRow({
    level,
    label,
    icon,
    price,
    cashPrice,
    modifier,
    modifierType,
    isCurrentLevel,
    isActive,
    isOverride,
}: PriceLevelRowProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-between py-1.5 px-2 rounded text-sm",
                isCurrentLevel && "bg-blue-50 border border-blue-200",
                !isActive && "opacity-50"
            )}
        >
            <div className="flex items-center gap-2">
                <span className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                    isCurrentLevel ? "bg-blue-500 text-white" : "bg-muted"
                )}>
                    {level}
                </span>
                <span className="flex items-center gap-1">
                    {icon}
                    {label}
                </span>
                {isOverride && isActive && (
                    <Badge variant="outline" className="text-xs h-4 px-1">
                        Override
                    </Badge>
                )}
            </div>
            <div className="text-right">
                {price !== null ? (
                    <span className={cn(
                        "font-medium",
                        isCurrentLevel && "text-blue-600"
                    )}>
                        ${price.toFixed(2)}
                    </span>
                ) : modifier !== null ? (
                    <span className="text-amber-600">
                        {modifierType === 'add' ? '+' : ''}
                        {modifier}
                        {modifierType === 'percent' ? '%' : ''}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                )}
            </div>
        </div>
    )
}