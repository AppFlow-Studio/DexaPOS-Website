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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreateMenuItem, UpdateMenuItem, ResetMenuItemToGlobal } from '@/app/dashboard/actions/menu-items'
import { CategoriesModel, ModifierGroupsModel, ModifierGroupItemsModel } from '@/types/db-modles'
import { useLocationStore, useIsAllLocations } from '@/stores/location-store'

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

interface EditItemWithOverride {
    id: string
    name: string
    description?: string
    price: number
    cash_price?: number
    image?: string
    image_url?: string
    availability: boolean
    allergens?: string[]
    card_bg_color?: string
    stock_tracking_mode?: string
    menu_item_categories?: any[]
    menu_item_modifier_groups?: any[]
    // Location override fields
    effective_price?: number
    effective_cash_price?: number | null
    has_price_override?: boolean
    location_is_available?: boolean
    global_price?: number
    global_cash_price?: number | null
}

interface ItemFormSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    clerkOrgId: string | undefined
    categories?: CategoriesModel[]
    modifierGroups?: (ModifierGroupsModel & { modifier_group_items: ModifierGroupItemsModel[] })[]
    onSuccess?: () => void
    editItem?: EditItemWithOverride
}

// Common allergens
const COMMON_ALLERGENS = [
    'Dairy', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame'
]

export function ItemFormSheet({
    open,
    onOpenChange,
    clerkOrgId,
    categories = [],
    modifierGroups = [],
    onSuccess,
    editItem,
}: ItemFormSheetProps) {
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

    // Get current location name for display
    const currentLocationName = React.useMemo(() => {
        if (isAllLocations) return 'All Locations'
        const location = locations.find(l => l.id === selectedLocationId)
        return location?.name || 'Unknown Location'
    }, [isAllLocations, selectedLocationId, locations])

    // Determine if we're editing with a price override
    const hasExistingOverride = editItem?.has_price_override ?? false
    const isLocationScoped = !isAllLocations && editItem

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

    // Reset form when editItem changes
    React.useEffect(() => {
        if (editItem) {
            // When location-scoped, use effective prices if available
            const priceToShow = isLocationScoped && editItem.effective_price !== undefined
                ? editItem.effective_price
                : editItem.price || 0
            const cashPriceToShow = isLocationScoped && editItem.effective_cash_price !== undefined
                ? editItem.effective_cash_price
                : editItem.cash_price

            form.reset({
                name: editItem.name || '',
                description: editItem.description || '',
                price: priceToShow,
                cash_price: cashPriceToShow ?? undefined,
                image_url: editItem.image || editItem.image_url || '',
                availability: isLocationScoped
                    ? (editItem.location_is_available ?? editItem.availability ?? true)
                    : (editItem.availability ?? true),
                allergens: editItem.allergens || [],
                card_bg_color: editItem.card_bg_color || '',
                stock_tracking_mode: (editItem.stock_tracking_mode as 'in_stock' | 'out_of_stock' | 'quantity') || 'in_stock',
            })
            // Set selected categories from editItem
            if (editItem.menu_item_categories) {
                setSelectedCategories(editItem.menu_item_categories.map((c: any) => c.category_id || c.category?.id).filter(Boolean))
            }
            // Set selected modifiers from editItem
            if (editItem.menu_item_modifier_groups) {
                setSelectedModifiers(editItem.menu_item_modifier_groups.map((m: any) => m.modifier_group_id || m.modifier_group?.id).filter(Boolean))
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
    }, [editItem, form, isLocationScoped])

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

    const handleResetToGlobal = async () => {
        if (!editItem?.id || isAllLocations) return

        setIsResetting(true)
        try {
            const result = await ResetMenuItemToGlobal(editItem.id, selectedLocationId)

            if (result.error) {
                toast.error('Reset Failed', { description: result.error })
                return
            }

            toast.success('Reset to Global', {
                description: 'Item now uses global pricing at this location'
            })

            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
            queryClient.invalidateQueries({ queryKey: ['menu-item', editItem.id] })
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error('Reset Failed', {
                description: 'Unable to reset item to global pricing.'
            })
        } finally {
            setIsResetting(false)
        }
    }

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
                // Update existing item - pass locationId for location-scoped updates
                const locationId = isAllLocations ? undefined : selectedLocationId
                result = await UpdateMenuItem(editItem.id, {
                    name: values.name,
                    description: values.description,
                    price: values.price,
                    cash_price: values.cash_price ?? undefined,
                    image: values.image_url ?? undefined,
                    availability: values.availability,
                    allergens: values.allergens,
                    card_bg_color: values.card_bg_color ?? undefined,
                    stock_tracking_mode: values.stock_tracking_mode,
                }, locationId)
            } else {
                // Create new item (always global)
                result = await CreateMenuItem(clerkOrgId, {
                    name: values.name,
                    description: values.description,
                    price: values.price,
                    cash_price: values.cash_price ?? undefined,
                    image: values.image_url ?? undefined,
                    availability: values.availability,
                    allergens: values.allergens,
                    card_bg_color: values.card_bg_color ?? undefined,
                    stock_tracking_mode: values.stock_tracking_mode,
                })
            }

            if (result.error) {
                toast.error('Operation Failed', {
                    description: result.error
                })
                return
            }

            // Different success messages based on scope
            const scopeMessage = editItem && !isAllLocations
                ? ` at ${currentLocationName}`
                : ''

            toast.success(editItem ? 'Item Updated' : 'Item Created', {
                description: editItem
                    ? `"${values.name}" has been updated${scopeMessage}.`
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
                description: editItem
                    ? 'Unable to update the menu item. Please try again.'
                    : 'Unable to create the menu item. Please try again.'
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

    return (
        <BottomSheet open={open} onOpenChange={handleClose}>
            <BottomSheetContent className="!h-[95vh]">
                <BottomSheetHeader>
                    <BottomSheetTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                        {editItem ? 'Edit Menu Item' : 'Create New Menu Item'}
                    </BottomSheetTitle>
                    <BottomSheetDescription className="space-y-2">
                        <span>Fill in the details below. Preview updates in real-time.</span>

                        {/* Location Scope Indicator */}
                        {editItem && (
                            <div className="flex items-center gap-2 mt-2">
                                <Badge
                                    variant={isAllLocations ? "secondary" : "default"}
                                    className={cn(
                                        "gap-1 animate-in fade-in slide-in-from-left-2 duration-300",
                                        !isAllLocations && "bg-blue-500/10 text-blue-600 border-blue-200"
                                    )}
                                >
                                    <MapPin className="h-3 w-3" />
                                    {isAllLocations ? 'Editing Global' : `Editing for ${currentLocationName}`}
                                </Badge>

                                {hasExistingOverride && !isAllLocations && (
                                    <Badge
                                        variant="outline"
                                        className="gap-1 bg-amber-500/10 text-amber-600 border-amber-200 animate-in fade-in slide-in-from-left-4 duration-300"
                                    >
                                        <Info className="h-3 w-3" />
                                        Has location-specific pricing
                                    </Badge>
                                )}
                            </div>
                        )}
                    </BottomSheetDescription>
                </BottomSheetHeader>

                <BottomSheetBody className="px-0">
                    <div className="flex flex-col lg:flex-row h-full">
                        {/* Form Section */}
                        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                            <Form {...form}>
                                <form id="item-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    {/* Basic Info Section */}
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                            <Settings2 className="h-4 w-4" />
                                            Basic Information
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
                                                            {...field}
                                                        />
                                                    </FormControl>
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
                                                            placeholder="Describe your dish in a way that makes customers hungry..."
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
                                                                {...field}
                                                                value={field.value || ''}
                                                            />
                                                        </div>
                                                    </FormControl>
                                                    <FormDescription>Enter a URL for the item image</FormDescription>
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
                                                    {isLocationScoped && (
                                                        <Badge variant="outline" className="text-xs ml-1">
                                                            {hasExistingOverride ? 'Location Override' : 'Will create override'}
                                                        </Badge>
                                                    )}
                                                </span>
                                                {expandedSections.pricing ? (
                                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {/* Global price reference when location scoped */}
                                            {isLocationScoped && editItem?.global_price !== undefined && (
                                                <div className="p-3 rounded-lg bg-muted/30 border border-dashed animate-in fade-in duration-300">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-sm text-muted-foreground">
                                                            <span className="font-medium">Global Price:</span>{' '}
                                                            ${editItem.global_price.toFixed(2)}
                                                            {editItem.global_cash_price && (
                                                                <span className="ml-2">(Cash: ${editItem.global_cash_price.toFixed(2)})</span>
                                                            )}
                                                        </div>
                                                        {hasExistingOverride && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={handleResetToGlobal}
                                                                disabled={isResetting}
                                                                className="h-7 text-xs gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                            >
                                                                <RotateCcw className={cn("h-3 w-3", isResetting && "animate-spin")} />
                                                                Reset to Global
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="price"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                {isLocationScoped ? 'Location Card Price *' : 'Card Price *'}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        className={cn(
                                                                            "pl-7",
                                                                            isLocationScoped && hasExistingOverride && "border-amber-300 focus:ring-amber-500"
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
                                                            <FormLabel>
                                                                {isLocationScoped ? 'Location Cash Price' : 'Cash Price'}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        className={cn(
                                                                            "pl-7",
                                                                            isLocationScoped && hasExistingOverride && "border-amber-300 focus:ring-amber-500"
                                                                        )}
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

                                            {/* Location scope notice */}
                                            {isLocationScoped && !hasExistingOverride && (
                                                <div className="text-xs text-muted-foreground flex items-center gap-1 p-2 bg-blue-50 rounded-md border border-blue-100">
                                                    <Info className="h-3 w-3 text-blue-500" />
                                                    Changing price will create a location-specific override. Global price remains unchanged.
                                                </div>
                                            )}
                                        </CollapsibleContent>
                                    </Collapsible>

                                    {/* Categories Section */}
                                    <Collapsible open={expandedSections.categories} onOpenChange={() => toggleSection('categories')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <Tag className="h-4 w-4 text-blue-500" />
                                                    Categories
                                                    {selectedCategories.length > 0 && (
                                                        <Badge variant="secondary" className="ml-2">{selectedCategories.length}</Badge>
                                                    )}
                                                </span>
                                                {expandedSections.categories ? (
                                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {categories.length === 0 ? (
                                                <div className="text-center py-4 text-muted-foreground text-sm">
                                                    No categories available. Create categories first.
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {categories.map((category) => (
                                                        <button
                                                            key={category.id}
                                                            type="button"
                                                            onClick={() => toggleCategory(category.id)}
                                                            className={cn(
                                                                "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                                                                "border hover:scale-105 active:scale-95",
                                                                selectedCategories.includes(category.id)
                                                                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                                                                    : "bg-background border-border hover:border-primary/50"
                                                            )}
                                                        >
                                                            {category.name}
                                                        </button>
                                                    ))}
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
                                                {expandedSections.modifiers ? (
                                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {modifierGroups.length === 0 ? (
                                                <div className="text-center py-4 text-muted-foreground text-sm">
                                                    No modifier groups available. Create modifier groups first.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {modifierGroups.map((group) => (
                                                        <div
                                                            key={group.id}
                                                            onClick={() => toggleModifier(group.id)}
                                                            className={cn(
                                                                "p-3 rounded-lg border cursor-pointer transition-all duration-200",
                                                                "hover:shadow-md",
                                                                selectedModifiers.includes(group.id)
                                                                    ? "border-primary bg-primary/5 shadow-sm"
                                                                    : "border-border hover:border-primary/50"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <div className="font-medium flex items-center gap-2">
                                                                        {group.name}
                                                                        {group.is_required && (
                                                                            <Badge variant="destructive" className="text-xs">Required</Badge>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-sm text-muted-foreground mt-1">
                                                                        {group.modifier_group_items?.length || 0} options
                                                                    </div>
                                                                </div>
                                                                <div className={cn(
                                                                    "w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center",
                                                                    selectedModifiers.includes(group.id)
                                                                        ? "border-primary bg-primary"
                                                                        : "border-muted-foreground"
                                                                )}>
                                                                    {selectedModifiers.includes(group.id) && (
                                                                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            {group.modifier_group_items && group.modifier_group_items.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-2">
                                                                    {group.modifier_group_items.slice(0, 4).map((item) => (
                                                                        <Badge key={item.id} variant="outline" className="text-xs">
                                                                            {item.name} {item.price_modifier > 0 && `+$${item.price_modifier}`}
                                                                        </Badge>
                                                                    ))}
                                                                    {group.modifier_group_items.length > 4 && (
                                                                        <Badge variant="outline" className="text-xs">
                                                                            +{group.modifier_group_items.length - 4} more
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
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
                                                {expandedSections.allergens ? (
                                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="flex flex-wrap gap-2">
                                                {COMMON_ALLERGENS.map((allergen) => (
                                                    <button
                                                        key={allergen}
                                                        type="button"
                                                        onClick={() => toggleAllergen(allergen)}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                                                            "border hover:scale-105 active:scale-95",
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
                                                {expandedSections.advanced ? (
                                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <FormField
                                                control={form.control}
                                                name="availability"
                                                render={({ field }) => (
                                                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                                        <div className="space-y-0.5">
                                                            <FormLabel className="text-base">
                                                                {isLocationScoped ? 'Available at This Location' : 'Available for Sale'}
                                                            </FormLabel>
                                                            <FormDescription>
                                                                {isLocationScoped
                                                                    ? 'Toggle whether this item is available at this location'
                                                                    : 'Toggle whether this item is available in the POS'}
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
                                                                    {...field}
                                                                    value={field.value || '#ffffff'}
                                                                />
                                                                <Input
                                                                    placeholder="#000000"
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
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Live Preview
                            </h3>
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

                                {/* Price comparison when location scoped */}
                                {isLocationScoped && editItem?.global_price !== undefined && watchedValues.price !== editItem.global_price && (
                                    <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2 text-amber-700">
                                            <Info className="h-4 w-4" />
                                            <span className="font-medium">Price differs from global</span>
                                        </div>
                                        <div className="mt-1 text-amber-600">
                                            Global: ${editItem.global_price.toFixed(2)} →
                                            Location: ${watchedValues.price.toFixed(2)}
                                        </div>
                                    </div>
                                )}

                                {/* Selected info summary */}
                                <div className="mt-6 space-y-2 text-sm">
                                    {selectedModifiers.length > 0 && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Layers className="h-4 w-4" />
                                            {selectedModifiers.length} modifier group{selectedModifiers.length !== 1 ? 's' : ''} selected
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
                                {editItem ? 'Saving...' : 'Creating...'}
                            </>
                        ) : editItem ? (
                            isLocationScoped ? 'Save for Location' : 'Save Changes'
                        ) : 'Create Item'}
                    </Button>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}
