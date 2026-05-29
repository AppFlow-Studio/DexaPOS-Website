'use client'

import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CdnImageUploadField } from '@/components/ui/cdn-image-upload-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  DollarSign,
  RotateCcw,
  AlertCircle,
  Tag,
  Smartphone,
  Globe,
  Monitor,
  X,
  Plus,
  Sliders,
  Search,
  Layers,
  MapPin,
  Building2,
  Receipt,
  Lock,
  Palette,
  Truck,
  Utensils,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useMerchantCdnImageUpload } from '@/lib/cdn/use-merchant-cdn-image-upload'

import {
  createAdminMenuItem,
  updateAdminMenuItem,
  addItemToCategory,
  upsertAdminLocationItemOverride,
  deleteAdminLocationItemOverride,
  assignModifierGroupToItem,
  removeModifierGroupFromItem,
  createAdminModifierGroup,
  createAdminModifierItem,
  createAdminCategory,
  type AdminMenuItem,
  type AdminMenuItemModifierGroup,
} from '@/app/manage/actions/admin-merchant/menus'

import {
  useAdminModifierGroups,
  useAdminItemModifierGroups,
  useAdminCategories,
} from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'
import { useMerchantDetails } from '@/lib/queries/use-merchants'
import { PriceInputGroup } from '@/components/dashboard/locations/PriceInputGroup'
import { AdminPriceBreakdown } from '../components/AdminPriceBreakdown'
import { RecipeManager } from '@/app/dashboard/menu/components/RecipeManager'
import { ItemPreviewCard } from '@/components/dashboard/menu/ItemPreviewCard'
import { cn } from '@/lib/utils'

// ============================================================================
// CONSTANTS
// ============================================================================

const CHANNELS = [
  { id: 'pos', label: 'POS', icon: Monitor },
  { id: 'online', label: 'Online', icon: Globe },
  { id: 'kiosk', label: 'Kiosk', icon: Smartphone },
] as const

const TAX_CATEGORIES = [
  { value: 'standard', label: 'Standard Rate' },
  { value: 'food', label: 'Food & Beverage' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'exempt', label: 'Tax Exempt' },
] as const

const STOCK_MODES = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'out_of_stock', label: 'Out of Stock' },
  { value: 'quantity', label: 'Track Quantity' },
] as const

const ALLERGENS = [
  'Dairy', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts',
  'Peanuts', 'Wheat', 'Soy', 'Sesame',
] as const

const MEAL_TYPES = [
  'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert', 'Beverage',
] as const

// ============================================================================
// SCHEMA
// ============================================================================

const itemFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional().nullable(),
  image: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  price: z.coerce.number().min(0, 'Price must be positive'),
  cash_price: z.coerce.number().min(0, 'Cash price must be positive').optional().nullable(),
  delivery_price: z.coerce.number().min(0, 'Delivery price must be positive').optional().nullable(),
  use_delivery_price: z.boolean().default(false),
  allergens: z.array(z.string()).default([]),
  meal_types: z.array(z.string()).default([]),
  card_bg_color: z.string().optional().nullable().or(z.literal('')),
  availability: z.boolean().default(true),
  tax_category: z.string().default('standard'),
  is_tax_exempt: z.boolean().default(false),
  stock_tracking_mode: z.enum(['in_stock', 'out_of_stock', 'quantity']).nullable().optional(),
  available_channels: z.array(z.string()).default(['pos', 'online', 'kiosk']),
  // Location override fields
  override_price: z.coerce.number().min(0).optional().nullable(),
  override_cash_price: z.coerce.number().min(0).optional().nullable(),
  override_delivery_price: z.coerce.number().min(0).optional().nullable(),
  override_availability: z.boolean().optional(),
  // New Local State
  modifier_group_ids: z.array(z.string()).optional(),
})

type ItemFormValues = z.infer<typeof itemFormSchema>

// ============================================================================
// COMPONENT
// ============================================================================

interface ItemFormSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  mode: 'create' | 'edit'
  item?: AdminMenuItem | null
  categoryId?: string | null
  onSuccess: () => void
}

export function ItemFormSheet({
  open,
  onClose,
  merchantId,
  locationId,
  mode,
  item,
  categoryId,
  onSuccess,
}: ItemFormSheetProps) {
  const isEdit = mode === 'edit'
  const isLocationView = locationId && locationId !== 'all'
  const [isResetting, setIsResetting] = useState(false)
  const [newModifierIds, setNewModifierIds] = useState<string[]>([]) // For create mode
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [showQuickCreateCategory, setShowQuickCreateCategory] = useState(false)
  const [createdCategoryNames, setCreatedCategoryNames] = useState<Record<string, string>>({})
  const hasLocationOverride = isEdit && item?.has_location_override
  const queryClient = useQueryClient()
  const itemImageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: 'menu-items',
    fileNamePrefix: 'item',
  })

  // Fetch merchant details for location names
  const { data: merchantDetails } = useMerchantDetails(merchantId)
  const { data: categoryOptions = [], isLoading: isLoadingCategories } = useAdminCategories(merchantId, locationId)
  const currentLocationName = isLocationView 
    ? merchantDetails?.locations.find((l) => l.id === locationId)?.name || 'This Location'
    : 'All Locations'
  const accessibleCategories = useMemo(
    () =>
      categoryOptions.filter((category) =>
        isLocationView
          ? category.is_global || category.location_id === locationId
          : category.is_global,
      ),
    [categoryOptions, isLocationView, locationId],
  )
  const selectedCategoryNames = useMemo(() => {
    if (selectedCategories.length > 0) {
      return selectedCategories
        .map((selectedCategoryId) => {
          const matchedCategory = accessibleCategories.find(
            (category) => category.id === selectedCategoryId,
          )

          if (matchedCategory) return matchedCategory.name

          const existingItemCategory = item?.categories?.find(
            (category) => category.id === selectedCategoryId,
          )

          return existingItemCategory?.name || createdCategoryNames[selectedCategoryId]
        })
        .filter((categoryName): categoryName is string => Boolean(categoryName))
    }

    return item?.categories?.map((category) => category.name) || []
  }, [accessibleCategories, createdCategoryNames, item?.categories, selectedCategories])

  // Form definition
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      price: 0,
      cash_price: null,
      delivery_price: null,
      use_delivery_price: false,
      allergens: [],
      meal_types: [],
      card_bg_color: '',
      availability: true,
      tax_category: 'standard',
      is_tax_exempt: false,
      stock_tracking_mode: 'in_stock',
      available_channels: ['pos', 'online', 'kiosk'],
      override_price: null,
      override_cash_price: null,
      override_delivery_price: null,
      override_availability: true,
    },
  })

  // Watch values for preview
  const watchedValues = form.watch()
  const isTaxExempt = form.watch('is_tax_exempt')

  // Effect to reset form
  useEffect(() => {
    if (open) {
      if (isEdit && item) {
        form.reset({
          name: item.name,
          description: item.description || '',
          image: item.image || '',
          price: item.base_price,
          cash_price: item.base_cash_price,
          delivery_price: item.base_delivery_price,
          use_delivery_price: item.use_delivery_price ?? false,
          allergens: item.allergens || [],
          meal_types: item.meal_types || [],
          card_bg_color: item.card_bg_color || '',
          availability: item.base_availability,
          tax_category: item.tax_category || 'standard',
          is_tax_exempt: item.is_tax_exempt,
          stock_tracking_mode: (item.stock_tracking_mode || 'in_stock') as any,
          available_channels: item.available_channels || ['pos', 'online', 'kiosk'],
          override_price: item.location_override?.custom_price,
          override_cash_price: item.location_override?.custom_cash_price,
          override_delivery_price: (item.location_override as any)?.custom_delivery_price,
          override_availability: item.location_override?.is_available ?? item.base_availability,
        })
        itemImageUpload.reset(item.image || null)
        setSelectedCategories(item.categories?.map((category) => category.id) || [])
        setCreatedCategoryNames({})
        setShowQuickCreateCategory(false)
      } else {
        form.reset({
          name: '',
          description: '',
          image: '',
          price: 0,
          cash_price: null,
          delivery_price: null,
          use_delivery_price: false,
          allergens: [],
          meal_types: [],
          card_bg_color: '',
          availability: true,
          tax_category: 'standard',
          is_tax_exempt: false,
          stock_tracking_mode: 'in_stock',
          available_channels: ['pos', 'online', 'kiosk'],
          override_price: null,
          override_cash_price: null,
          override_delivery_price: null,
          override_availability: true,
          modifier_group_ids: [],
        })
        itemImageUpload.reset(null)
        setNewModifierIds([])
        setSelectedCategories(categoryId ? [categoryId] : [])
        setCreatedCategoryNames({})
        setShowQuickCreateCategory(false)
      }
    }
  }, [categoryId, form, isEdit, item, itemImageUpload.reset, open])

  const toggleCategory = (categoryValue: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryValue)
        ? prev.filter((id) => id !== categoryValue)
        : [...prev, categoryValue],
    )
  }

  // Handlers
  const onSubmit = async (values: ItemFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined
    const categoryIdsToAssign = Array.from(
      new Set(categoryId ? [categoryId, ...selectedCategories] : selectedCategories),
    )

    try {
      if (!isEdit && categoryIdsToAssign.length === 0) {
        toast.error('Please select at least one category')
        return
      }

      const canEditBaseFields = !isLocationView || !isEdit
      const resolvedImage = canEditBaseFields
        ? await itemImageUpload.resolveImageValue()
        : { value: item?.image || null }
      uploadedAsset = resolvedImage.uploadedAsset

      if (isEdit && item) {
        if (isLocationView && locationId) {
          const overrideResult = await upsertAdminLocationItemOverride(
            merchantId,
            locationId,
            item.id,
            {
              custom_price: values.override_price,
              custom_cash_price: values.override_cash_price,
              custom_delivery_price: values.override_delivery_price,
              is_available: values.override_availability,
            }
          )
          if (!overrideResult.success) {
            toast.error('Failed to save override', { description: overrideResult.error })
            return
          }
          toast.success('Location override saved')
        } else {
          const result = await updateAdminMenuItem(merchantId, item.id, {
            name: values.name,
            description: values.description || null,
            image: resolvedImage.value,
            price: values.price,
            cash_price: values.cash_price,
            delivery_price: values.delivery_price,
            use_delivery_price: values.use_delivery_price,
            allergens: values.allergens,
            meal_types: values.meal_types,
            card_bg_color: values.card_bg_color || null,
            availability: values.availability,
            tax_category: values.tax_category,
            is_tax_exempt: values.is_tax_exempt,
            stock_tracking_mode: values.stock_tracking_mode as any,
            available_channels: values.available_channels,
          })
          if (result.error) {
            if (uploadedAsset) {
              await itemImageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
            }
            toast.error('Failed to update item', { description: result.error })
            return
          }
          toast.success('Item updated')
        }
      } else {
        const result = await createAdminMenuItem(merchantId, {
          name: values.name,
          description: values.description || null,
          location_id: isLocationView ? locationId : null,
          image: resolvedImage.value,
          price: values.price,
          cash_price: values.cash_price,
          delivery_price: values.delivery_price,
          use_delivery_price: values.use_delivery_price,
          allergens: values.allergens,
          meal_types: values.meal_types,
          card_bg_color: values.card_bg_color || null,
          availability: values.availability,
          tax_category: values.tax_category,
          is_tax_exempt: values.is_tax_exempt,
          stock_tracking_mode: values.stock_tracking_mode as any,
          available_channels: values.available_channels,
          modifier_group_ids: newModifierIds, // Pass the local state
        })
        if (result.error || !result.data) {
          if (uploadedAsset) {
            await itemImageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
          }
          toast.error('Failed to create item', { description: result.error })
          return
        }

        const assignmentResults = await Promise.all(
          categoryIdsToAssign.map((selectedCategoryId) =>
            addItemToCategory(merchantId, selectedCategoryId, result.data.id),
          ),
        )

        if (assignmentResults.some((assignmentResult) => assignmentResult.error)) {
          toast.warning('Item created but some category assignments failed')
        }
        toast.success('Item created successfully')
      }
      // Force refresh of the items list
      queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuItems(merchantId, locationId).slice(0, -1) })
      // If we added to a category, might need to invalidate categories too
      if (categoryIdsToAssign.length > 0) {
           queryClient.invalidateQueries({ queryKey: adminKeys.merchantCategories(merchantId, locationId) })
           categoryIdsToAssign.forEach((selectedCategoryId) => {
             queryClient.invalidateQueries({ queryKey: ['admin', 'merchant', 'category', selectedCategoryId] })
           })
      }
      setShowQuickCreateCategory(false)
      setCreatedCategoryNames({})
      onSuccess()
      onClose()
    } catch (error) {
      if (uploadedAsset) {
        await itemImageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
      }
      toast.error('An unexpected error occurred')
      console.error(error)
    }
  }

  const handleResetToGlobal = async () => {
    if (!item || !isLocationView || !locationId) return
    setIsResetting(true)
    try {
      const result = await deleteAdminLocationItemOverride(merchantId, locationId, item.id)
      if (result.success) {
        toast.success('Reset to global pricing')
        onSuccess()
        onClose()
      } else {
        toast.error('Failed to reset', { description: result.error })
      }
    } catch (e) {
      console.error(e)
      toast.error('Error resetting override')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-5xl xl:max-w-6xl"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[min(92vh,960px)] flex-col">
            <DialogHeader className="border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
              <div className="space-y-2">
                <DialogTitle className="flex items-center gap-2 text-[1.625rem] font-semibold tracking-tight">
                  {isEdit ? 'Edit Menu Item' : 'New Menu Item'}
                  {isLocationView && (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                      <MapPin className="h-3 w-3 mr-1" />
                      {currentLocationName} Override
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="max-w-[60ch] text-sm leading-6">
                  {isLocationView
                    ? 'Editing location pricing. This price applies to all menus at this location.'
                    : 'Configure item details, pricing, and availability.'}
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="min-h-0 flex flex-1 flex-col overflow-hidden lg:flex-row">
                {/* LEFT COLUMN - FORM */}
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {/* Location Warning Banner */}
                    {isEdit && isLocationView && (
                        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/50">
                            <div className="flex items-start justify-between">
                                <div className="flex gap-3">
                                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-blue-900 dark:text-blue-100">Location Override Active</h4>
                                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 max-w-md">
                                            You are editing properties specific to <strong>{currentLocationName}</strong>. 
                                            Base properties (name, description, image) are inherited from the global item.
                                        </p>
                                    </div>
                                </div>
                                {hasLocationOverride && (
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={handleResetToGlobal}
                                        disabled={isResetting}
                                        className="bg-white hover:bg-blue-50 border-blue-200 text-blue-700"
                                    >
                                        {isResetting ? <Loader2 className="h-3 w-3 animate-spin mr-2"/> : <RotateCcw className="h-3 w-3 mr-2"/>}
                                        Reset to Global
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="w-full justify-start mb-6 bg-transparent border-b rounded-none h-auto p-0 gap-6 overflow-x-auto">
                            <TabsTrigger 
                                value="general" 
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 flex-shrink-0"
                            >General</TabsTrigger>
                            <TabsTrigger 
                                value="pricing" 
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 flex-shrink-0"
                            >Pricing</TabsTrigger>
                            <TabsTrigger 
                                value="modifiers" 
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 flex-shrink-0"
                            >Modifiers</TabsTrigger>
                            <TabsTrigger 
                                value="recipe" 
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 flex-shrink-0"
                            >Recipe</TabsTrigger>
                            <TabsTrigger 
                                value="tax" 
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 flex-shrink-0"
                            >Tax & Fees</TabsTrigger>
                            <TabsTrigger 
                                value="availability" 
                                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-2 flex-shrink-0"
                            >Availability</TabsTrigger>
                        </TabsList>

                        {/* GENERAL TAB */}
                        <TabsContent value="general" className="space-y-6 mt-0">
                            {(!isLocationView || !isEdit) ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <Badge variant="outline" className="text-xs font-normal">BASIC INFORMATION</Badge>
                                    </div>
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Item Name *</FormLabel>
                                                <FormControl><Input placeholder="e.g. Americano" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {isLocationView && isEdit && <p className="text-amber-600 text-xs">Switch to "All Locations" to edit item details</p>}

                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Description</FormLabel>
                                                <FormControl><Textarea placeholder="Espresso shots with hot water..." rows={3} {...field} value={field.value || ''} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Image Upload */}
                                    <FormField
                                        control={form.control}
                                        name="image"
                                        render={() => (
                                            <FormItem>
                                                <FormLabel>Image</FormLabel>
                                                <FormControl>
                                                    <CdnImageUploadField
                                                        disabled={form.formState.isSubmitting || (isLocationView && isEdit)}
                                                        helperText="Uploads to Bunny CDN when you save the item."
                                                        onClear={itemImageUpload.clear}
                                                        onFileSelect={itemImageUpload.selectFile}
                                                        previewUrl={itemImageUpload.previewUrl}
                                                        selectedFileName={itemImageUpload.selectedFileName}
                                                        uploadLabel="Upload item image"
                                                        uploading={itemImageUpload.isUploading}
                                                    />
                                                </FormControl>
                                                {isLocationView && isEdit && (
                                                    <FormDescription className="text-amber-600">
                                                        Switch to &quot;All Locations&quot; to edit item details
                                                    </FormDescription>
                                                )}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Card Background Color */}
                                    <FormField
                                        control={form.control}
                                        name="card_bg_color"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-2">
                                                    <Palette className="h-4 w-4" /> Card Background Color
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="flex items-center gap-3">
                                                        <input type="color" value={field.value || '#ffffff'} onChange={e => field.onChange(e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                                                        <Input placeholder="#ffffff" className="flex-1" {...field} value={field.value || ''} />
                                                        {field.value && <Button type="button" size="sm" variant="ghost" onClick={() => field.onChange('')}><X className="h-3 w-3" /></Button>}
                                                    </div>
                                                </FormControl>
                                                <FormDescription>Custom background color for the POS menu card</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="space-y-4 rounded-xl border border-border/70 bg-background p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Tag className="h-4 w-4 text-blue-500" />
                                                <div className="flex items-center gap-2">
                                                    <FormLabel className="mb-0">Categories</FormLabel>
                                                    {selectedCategories.length > 0 && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {selectedCategories.length}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {!isEdit && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setShowQuickCreateCategory((prev) => !prev)}
                                                >
                                                    {showQuickCreateCategory ? (
                                                        <>
                                                            <X className="mr-1 h-3.5 w-3.5" />
                                                            Close
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Plus className="mr-1 h-3.5 w-3.5" />
                                                            New Category
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>

                                        {isEdit ? (
                                            <div className="space-y-3">
                                                {selectedCategoryNames.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedCategoryNames.map((categoryName) => (
                                                            <Badge key={categoryName} variant="outline">
                                                                {categoryName}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm italic text-muted-foreground">
                                                        This item is currently uncategorized.
                                                    </p>
                                                )}
                                                <FormDescription>
                                                    Category reassignment is handled from category and menu management views.
                                                </FormDescription>
                                            </div>
                                        ) : (
                                            <>
                                                {selectedCategories.length === 0 && accessibleCategories.length > 0 && (
                                                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                                        <div className="space-y-1">
                                                            <p className="font-medium text-amber-800">Select at least one category</p>
                                                            <p className="text-xs text-amber-700">
                                                                HQ item creation should follow the merchant flow here. New items need a category before save.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {isLoadingCategories ? (
                                                    <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                                                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin opacity-60" />
                                                        <p>Loading categories...</p>
                                                    </div>
                                                ) : accessibleCategories.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                                                        <Tag className="mx-auto mb-2 h-8 w-8 opacity-50" />
                                                        <p>No categories available in this scope.</p>
                                                        <p className="mt-1 text-xs">
                                                            Create one here before saving the item.
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap gap-2">
                                                            {accessibleCategories.map((category) => {
                                                                const isSelected = selectedCategories.includes(category.id)

                                                                return (
                                                                    <button
                                                                        key={category.id}
                                                                        type="button"
                                                                        onClick={() => toggleCategory(category.id)}
                                                                        className={cn(
                                                                            'rounded-full border px-3 py-1.5 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.99]',
                                                                            isSelected
                                                                                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                                                                : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40',
                                                                        )}
                                                                    >
                                                                        {category.name}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>

                                                        {selectedCategories.length > 0 && (
                                                            <button
                                                                type="button"
                                                                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                                                                onClick={() => setSelectedCategories(categoryId ? [categoryId] : [])}
                                                            >
                                                                <X className="h-3 w-3" />
                                                                Clear extra category selections
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {showQuickCreateCategory && (
                                                    <QuickCreateCategoryDialog
                                                        merchantId={merchantId}
                                                        locationId={isLocationView ? locationId : null}
                                                        onClose={() => setShowQuickCreateCategory(false)}
                                                        onCreated={async (newCategoryId, newCategoryName) => {
                                                            setCreatedCategoryNames((prev) => ({
                                                                ...prev,
                                                                [newCategoryId]: newCategoryName,
                                                            }))
                                                            setSelectedCategories((prev) =>
                                                                prev.includes(newCategoryId) ? prev : [...prev, newCategoryId],
                                                            )
                                                            setShowQuickCreateCategory(false)
                                                            await queryClient.invalidateQueries({
                                                                queryKey: adminKeys.merchantCategories(merchantId, locationId),
                                                            })
                                                        }}
                                                    />
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <Separator className="my-4" />

                                    {/* Allergens */}
                                    <FormField
                                        control={form.control}
                                        name="allergens"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-2">
                                                    <AlertCircle className="h-4 w-4" /> Allergens
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="flex flex-wrap gap-2">
                                                        {ALLERGENS.map(allergen => {
                                                            const isSelected = field.value?.includes(allergen)
                                                            return (
                                                                <Badge
                                                                    key={allergen}
                                                                    variant={isSelected ? 'default' : 'outline'}
                                                                    className={cn('cursor-pointer transition-colors', isSelected ? 'bg-red-600 hover:bg-red-700' : 'hover:bg-muted')}
                                                                    onClick={() => {
                                                                        const current = field.value || []
                                                                        field.onChange(isSelected ? current.filter(a => a !== allergen) : [...current, allergen])
                                                                    }}
                                                                >
                                                                    {allergen}
                                                                </Badge>
                                                            )
                                                        })}
                                                    </div>
                                                </FormControl>
                                                <FormDescription>Select all allergens present in this item</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Meal Types */}
                                    <FormField
                                        control={form.control}
                                        name="meal_types"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="flex items-center gap-2">
                                                    <Utensils className="h-4 w-4" /> Meal Types
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="flex flex-wrap gap-2">
                                                        {MEAL_TYPES.map(mealType => {
                                                            const isSelected = field.value?.includes(mealType)
                                                            return (
                                                                <Badge
                                                                    key={mealType}
                                                                    variant={isSelected ? 'default' : 'outline'}
                                                                    className={cn('cursor-pointer transition-colors', isSelected ? '' : 'hover:bg-muted')}
                                                                    onClick={() => {
                                                                        const current = field.value || []
                                                                        field.onChange(isSelected ? current.filter(m => m !== mealType) : [...current, mealType])
                                                                    }}
                                                                >
                                                                    {mealType}
                                                                </Badge>
                                                            )
                                                        })}
                                                    </div>
                                                </FormControl>
                                                <FormDescription>Categorize when this item is typically served</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            ) : (
                                <div className="p-8 text-center bg-muted/20 rounded-lg border border-dashed">
                                    <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                                    <h3 className="font-medium text-lg">Global Properties</h3>
                                    <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-2">
                                        Item name, description, and image are managed globally. Switch location filter to "All Locations" to edit these fields.
                                    </p>
                                </div>
                            )}
                        </TabsContent>

                        {/* PRICING TAB */}
                        <TabsContent value="pricing" className="space-y-6 mt-0">
                            {isLocationView && isEdit && item ? (
                                <div className="space-y-6">
                                    <AdminPriceBreakdown item={item} isAllLocations={false} currentLocationName={currentLocationName} />
                                    <Separator />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="override_price"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Location Price Override</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                            <Input type="number" step="0.01" min="0" placeholder={`Inherit: $${item.base_price}`} className="pl-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                                                        </div>
                                                    </FormControl>
                                                    <FormDescription>Set specific price for this location</FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="override_cash_price"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Location Cash Price</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                            <Input type="number" step="0.01" min="0" placeholder="Inherit" className="pl-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="override_delivery_price"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="flex items-center gap-2">
                                                        <Truck className="h-3 w-3" /> Location Delivery Price
                                                    </FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                            <Input type="number" step="0.01" min="0" placeholder="Inherit" className="pl-9" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                                                        </div>
                                                    </FormControl>
                                                    <FormDescription>Override delivery price at this location</FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <PriceInputGroup
                                        price={form.watch("price") || 0}
                                        cashPrice={form.watch("cash_price") ?? null}
                                        onPriceChange={(val) => form.setValue("price", val, { shouldValidate: true })}
                                        onCashPriceChange={(val) => form.setValue("cash_price", val, { shouldValidate: true })}
                                        label="Base Price"
                                        pricingStrategy={merchantDetails?.pricing_strategy ?? "manual"}
                                        dualPricingPercentage={merchantDetails?.dual_pricing_percentage ?? 4.0}
                                    />
                                    <Separator />
                                    <div className="space-y-4">
                                        <FormField
                                            control={form.control}
                                            name="use_delivery_price"
                                            render={({ field }) => (
                                                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                                    <div className="space-y-0.5">
                                                        <FormLabel className="text-base flex items-center gap-2">
                                                            <Truck className="h-4 w-4" /> Use Delivery Price
                                                        </FormLabel>
                                                        <FormDescription>Enable a separate price for delivery orders</FormDescription>
                                                    </div>
                                                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                </FormItem>
                                            )}
                                        />
                                        {form.watch('use_delivery_price') && (
                                            <FormField
                                                control={form.control}
                                                name="delivery_price"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Delivery Price</FormLabel>
                                                        <FormControl>
                                                            <div className="relative">
                                                                <Truck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                                <Input type="number" step="0.01" min="0" className="pl-9" placeholder="e.g. 12.99" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                                                            </div>
                                                        </FormControl>
                                                        <FormDescription>Price charged when item is ordered for delivery</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        {/* MODIFIERS TAB */}
                        <TabsContent value="modifiers" className="space-y-6 mt-0">
                            <ModifierGroupManager 
                                merchantId={merchantId} 
                                locationId={locationId} 
                                item={item}
                                selectedIds={newModifierIds}
                                onToggle={setNewModifierIds}
                            />
                        </TabsContent>
                        
                        {/* RECIPE TAB */}
                        <TabsContent value="recipe" className="space-y-6 mt-0">
                            {isEdit && item ? (
                                <RecipeManager
                                    menuItemId={item.id}
                                    menuItemName={item.name}
                                    clerkOrgId={merchantDetails?.clerk_org_id}
                                    merchantId={merchantId}
                                    locationId={locationId}
                                    isEditable={!isLocationView || (!!item.location_id && item.location_id === locationId)}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center p-12 text-center bg-muted/20 border border-dashed rounded-lg">
                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                        <Lock className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-medium">Recipe Management Locked</h3>
                                    <p className="text-sm text-muted-foreground max-w-sm mt-2 mb-6">
                                        Please create and save the item first. Once created, you can add ingredients and manage recipe costs.
                                    </p>
                                    <Button variant="secondary" onClick={() => form.handleSubmit(onSubmit)()} disabled={form.formState.isSubmitting}>
                                        {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                                        Create Item to Unlock
                                    </Button>
                                </div>
                            )}
                        </TabsContent>

                        {/* TAX TAB */}
                        <TabsContent value="tax" className="space-y-6 mt-0">
                            {(!isLocationView || !isEdit) ? (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="is_tax_exempt"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                                <div className="space-y-0.5">
                                                    <FormLabel className="text-base">Tax Exempt</FormLabel>
                                                    <FormDescription>No tax will be applied to this item</FormDescription>
                                                </div>
                                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    {!isTaxExempt && (
                                        <FormField
                                            control={form.control}
                                            name="tax_category"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Tax Category</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                        <SelectContent>
                                                            {TAX_CATEGORIES.map(cat => <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                </>
                            ) : (
                                <div className="p-8 text-center bg-muted/20 rounded-lg border border-dashed">
                                    <Receipt className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                                    <h3 className="font-medium text-lg">Global Tax Settings</h3>
                                    <p className="text-muted-foreground text-sm max-w-sm mx-auto mt-2">
                                        Tax settings are currently managed at the global level.
                                    </p>
                                </div>
                            )}
                        </TabsContent>

                        {/* AVAILABILITY TAB */}
                        <TabsContent value="availability" className="space-y-6 mt-0">
                           {isLocationView && isEdit ? (
                                <FormField
                                    control={form.control}
                                    name="override_availability"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between rounded-lg border bg-background p-4">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base">Available at {currentLocationName}</FormLabel>
                                                <FormDescription>Toggle to enable/disable this item at this location.</FormDescription>
                                            </div>
                                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                           ) : (
                               <>
                                <FormField
                                    control={form.control}
                                    name="availability"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base">Available</FormLabel>
                                                <FormDescription>Item is available for purchase</FormDescription>
                                            </div>
                                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="available_channels"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="mb-3 block">Sales Channels</FormLabel>
                                            <div className="grid grid-cols-3 gap-3">
                                                {CHANNELS.map(channel => {
                                                    const Icon = channel.icon
                                                    const isChecked = field.value?.includes(channel.id)
                                                    return (
                                                        <label key={channel.id} className={cn("flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-all", isChecked ? "border-primary bg-primary/5 ring-1 ring-primary" : "text-muted-foreground")}>
                                                            <Checkbox 
                                                                checked={isChecked}
                                                                onCheckedChange={checked => {
                                                                    const current = field.value || []
                                                                    field.onChange(checked ? [...current, channel.id] : current.filter(id => id !== channel.id))
                                                                }}
                                                                className="sr-only"
                                                            />
                                                            <Icon className={cn("h-6 w-6", isChecked ? "text-primary" : "opacity-50")} />
                                                            <span className="text-xs font-medium">{channel.label}</span>
                                                        </label>
                                                    )
                                                })}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="stock_tracking_mode"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Stock Tracking</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value || 'in_stock'}>
                                                <FormControl><SelectTrigger><SelectValue placeholder="Select tracking mode" /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    {STOCK_MODES.map(mode => <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                            <FormDescription>How should inventory be tracked for this item?</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                               </>
                           )}
                        </TabsContent>
                    </Tabs>
                </div>

                {/* RIGHT COLUMN - PREVIEW */}
                <div className="hidden min-h-0 w-[360px] shrink-0 overflow-y-auto border-l border-border/70 bg-muted/10 px-6 py-5 lg:block">
                    <div className="space-y-8 pb-4">
                        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                            <Monitor className="h-4 w-4" /> POS Preview
                        </div>
                        <ItemPreviewCard
                            name={watchedValues.name || 'New Item'}
                            description={watchedValues.description || ''}
                            price={isLocationView && isEdit ? (watchedValues.override_price ?? watchedValues.price) : watchedValues.price}
                            cashPrice={(isLocationView && isEdit ? (watchedValues.override_cash_price ?? watchedValues.cash_price) : watchedValues.cash_price) ?? undefined}
                            image={
                                itemImageUpload.previewUrl ||
                                watchedValues.image ||
                                item?.image ||
                                undefined
                            }
                            availability={isLocationView && isEdit ? (watchedValues.override_availability ?? true) : watchedValues.availability}
                            categories={selectedCategoryNames}
                            allergens={watchedValues.allergens ?? []}
                            expandDescription
                        />
                         <div>
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                                <Tag className="h-4 w-4" /> Allergens
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(watchedValues.allergens?.length ? watchedValues.allergens : []).map(a => (
                                    <Badge key={a} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">{a}</Badge>
                                ))}
                                {!watchedValues.allergens?.length && <p className="text-xs text-muted-foreground italic">No allergens selected</p>}
                            </div>
                        </div>
                        {watchedValues.meal_types?.length > 0 && (
                            <div className="mt-4">
                                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                                    <Utensils className="h-4 w-4" /> Meal Types
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {watchedValues.meal_types.map(m => (
                                        <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                        {watchedValues.use_delivery_price && watchedValues.delivery_price != null && (
                            <div className="mt-4">
                                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                                    <Truck className="h-4 w-4" /> Delivery Price
                                </div>
                                <p className="text-lg font-semibold">${watchedValues.delivery_price.toFixed(2)}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Item'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// Sub-component for Modifier Management
function ModifierGroupManager({ 
    merchantId, 
    locationId, 
    item,
    selectedIds = [], // For local state
    onToggle
}: { 
    merchantId: string, 
    locationId: string | null, 
    item: AdminMenuItem | null | undefined,
    selectedIds?: string[],
    onToggle?: (ids: string[]) => void
}) {
    const [searchQuery, setSearchQuery] = useState('')
    const [showQuickCreate, setShowQuickCreate] = useState(false)
    const queryClient = useQueryClient()
    const { data: allGroups } = useAdminModifierGroups(merchantId, locationId)
    // If no item, we use empty array for itemGroups query result, and rely on selectedIds
    const { data: itemGroups } = useAdminItemModifierGroups(merchantId, item?.id ?? null)

    // Calculate currently assigned IDs based on mode (edit vs create)
    const assignedIds = useMemo(() => {
        if (item) {
            return new Set(itemGroups?.map(g => g.id))
        }
        return new Set(selectedIds)
    }, [itemGroups, item, selectedIds])

    // Get the actual group objects for the "Assigned" list
    // In create mode, we filter allGroups by assignedIds
    const assignedGroupsList = useMemo(() => {
        if (item) return itemGroups || []
        return allGroups?.filter(g => assignedIds.has(g.id)) || []
    }, [item, itemGroups, allGroups, assignedIds])

    const availableGroups = useMemo(() => allGroups?.filter(g => !assignedIds.has(g.id)) || [], [allGroups, assignedIds])
    
    // Handlers for assign/remove
    const handleAssign = async (groupId: string) => {
        if (item) {
            toast.promise(assignModifierGroupToItem(merchantId, item.id, groupId), {
                loading: 'Adding modifier...',
                success: () => {
                    queryClient.invalidateQueries({ queryKey: adminKeys.merchantItemModifiers(merchantId, item.id) })
                    return 'Modifier group added'
                },
                error: 'Failed to add modifier'
            })
        } else if (onToggle) {
             onToggle([...selectedIds, groupId])
        }
    }

    const handleRemove = async (groupId: string) => {
        if (item) {
            toast.promise(removeModifierGroupFromItem(merchantId, item.id, groupId), {
                loading: 'Removing modifier...',
                success: () => {
                    queryClient.invalidateQueries({ queryKey: adminKeys.merchantItemModifiers(merchantId, item.id) })
                    return 'Modifier group removed'
                },
                error: 'Failed to remove modifier'
            })
        } else if (onToggle) {
            onToggle(selectedIds.filter(id => id !== groupId))
        }
    }

    return (
        <div className="space-y-6">
            <div className="space-y-3">
                 <h4 className="text-sm font-medium text-muted-foreground">Assigned Groups</h4>
                 {!assignedGroupsList?.length ? (
                     <p className="text-sm text-muted-foreground italic">No modifier groups assigned.</p>
                 ) : (
                     <div className="space-y-2">
                         {assignedGroupsList.map(group => (
                             <div key={group.id} className="flex items-center justify-between p-3 rounded-lg border bg-background group hover:border-primary/50 transition-colors">
                                 <div className="flex items-center gap-3">
                                     <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                                         <Layers className="h-4 w-4 text-muted-foreground" />
                                     </div>
                                     <div>
                                         <p className="font-medium text-sm">{group.name}</p>
                                         {/* Handle varying property names between admin list and item relation */}
                                         <p className="text-xs text-muted-foreground">{group.items_count ?? (group as any).modifier_group_items?.length ?? 0} options</p>
                                     </div>
                                 </div>
                                 <Button 
                                     type="button" // Prevent form submission
                                     size="icon" 
                                     variant="ghost" 
                                     className="h-8 w-8 text-muted-foreground hover:text-destructive" 
                                     onClick={() => handleRemove(group.id)}
                                 >
                                     <X className="h-4 w-4" />
                                 </Button>
                             </div>
                         ))}
                     </div>
                 )}
            </div>

            <Separator />

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-muted-foreground">Available Groups</h4>
                    <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuickCreate(true)}>
                            <Plus className="h-3 w-3 mr-1" /> New Group
                        </Button>
                        <div className="relative w-[200px]">
                            <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                            <Input 
                                placeholder="Search..." 
                                className="h-8 pl-7 text-xs" 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                    {availableGroups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase())).map(group => (
                        <div key={group.id} className="flex items-center justify-between p-2 rounded-lg border border-dashed hover:bg-muted/50 transition-colors">
                             <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded bg-muted/50 flex items-center justify-center">
                                    <Sliders className="h-4 w-4 text-muted-foreground opacity-50" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">{group.name}</p>
                                    <p className="text-xs text-muted-foreground">{group.items_count} options</p>
                                </div>
                            </div>
                            <Button 
                                type="button" // Prevent form submission
                                size="sm" 
                                variant="ghost" 
                                className="h-7 px-2 text-primary" 
                                onClick={() => handleAssign(group.id)}
                            >
                                <Plus className="h-3 w-3 mr-1" /> Add
                            </Button>
                        </div>
                    ))}
                    {!availableGroups.length && <p className="text-xs text-muted-foreground text-center py-4">No other modifier groups available.</p>}
                </div>
            </div>
                </div>

            {/* Quick Create Modifier Group Dialog */}
            {showQuickCreate && (
                <QuickCreateModifierDialog
                    merchantId={merchantId}
                    locationId={locationId}
                    onClose={() => setShowQuickCreate(false)}
                    onCreated={(groupId) => {
                        setShowQuickCreate(false)
                        queryClient.invalidateQueries({ queryKey: adminKeys.merchantModifiers(merchantId, locationId) })
                        handleAssign(groupId)
                    }}
                />
            )}
        </div>
    )
}

// ============================================================================
// QUICK CREATE MODIFIER GROUP (Inline Dialog)
// ============================================================================

function QuickCreateModifierDialog({
    merchantId,
    locationId,
    onClose,
    onCreated,
}: {
    merchantId: string
    locationId?: string | null
    onClose: () => void
    onCreated: (groupId: string) => void
}) {
    const [name, setName] = useState('')
    const [isRequired, setIsRequired] = useState(false)
    const [minSelections, setMinSelections] = useState(0)
    const [maxSelections, setMaxSelections] = useState<number | null>(null)
    const [options, setOptions] = useState<{ name: string; price_modifier: number; is_default: boolean }[]>([{ name: '', price_modifier: 0, is_default: false }])
    const [isSaving, setIsSaving] = useState(false)

    const addOption = () => setOptions([...options, { name: '', price_modifier: 0, is_default: false }])
    const removeOption = (index: number) => {
        const updated = options.filter((_, i) => i !== index)
        setOptions(updated)
    }
    const updateOption = (index: number, field: 'name' | 'price_modifier', value: string | number) => {
        const updated = [...options]
        updated[index] = { ...updated[index], [field]: value }
        setOptions(updated)
    }
    const setDefaultOption = (index: number) => {
        setOptions(options.map((opt, i) => ({ ...opt, is_default: i === index })))
    }

    const handleSave = async () => {
        if (!name.trim()) { toast.error('Group name is required'); return }
        const validOptions = options.filter(o => o.name.trim())
        if (validOptions.length === 0) { toast.error('At least one option is required'); return }

        setIsSaving(true)
        try {
            const result = await createAdminModifierGroup(merchantId, {
                name: name.trim(),
                is_required: isRequired,
                min_selections: minSelections,
                max_selections: maxSelections,
                location_id: locationId || null,
                is_active: true,
            })
            if (result.error || !result.data) {
                toast.error('Failed to create modifier group', { description: result.error })
                return
            }
            // Create options
            for (let i = 0; i < validOptions.length; i++) {
                const opt = validOptions[i]
                await createAdminModifierItem(merchantId, result.data.id, {
                    name: opt.name.trim(),
                    price_modifier: opt.price_modifier,
                    is_active: true,
                    is_default: opt.is_default,
                    display_order: i,
                })
            }
            toast.success(`Modifier group "${name}" created`)
            onCreated(result.data.id)
        } catch {
            toast.error('Failed to create modifier group')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="rounded-lg border bg-background p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Quick Create Modifier Group</h4>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}><X className="h-3 w-3" /></Button>
            </div>
            <Input placeholder="Group name (e.g. Size, Toppings)" value={name} onChange={e => setName(e.target.value)} />
            <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isRequired} onCheckedChange={(c) => setIsRequired(!!c)} /> Required
                </label>
                <div className="flex items-center gap-2 text-sm">
                    <span>Min:</span>
                    <Input type="number" className="w-16 h-7 text-xs" min={0} value={minSelections} onChange={e => setMinSelections(parseInt(e.target.value) || 0)} />
                    <span>Max:</span>
                    <Input type="number" className="w-16 h-7 text-xs" min={1} placeholder="∞" value={maxSelections ?? ''} onChange={e => setMaxSelections(e.target.value ? parseInt(e.target.value) : null)} />
                </div>
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Options</span>
                    <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={addOption}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                </div>
                {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                        {isRequired && (
                            <button
                                type="button"
                                onClick={() => setDefaultOption(i)}
                                className={cn(
                                    "shrink-0 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors",
                                    opt.is_default ? "border-primary bg-primary" : "border-muted-foreground/40 hover:border-primary/60"
                                )}
                                title="Set as default"
                            >
                                {opt.is_default && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </button>
                        )}
                        <Input placeholder="Option name" className="flex-1 h-8 text-xs" value={opt.name} onChange={e => updateOption(i, 'name', e.target.value)} />
                        <div className="relative w-24">
                            <DollarSign className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
                            <Input type="number" step="0.01" className="h-8 text-xs pl-6" placeholder="0.00" value={opt.price_modifier || ''} onChange={e => updateOption(i, 'price_modifier', parseFloat(e.target.value) || 0)} />
                        </div>
                        {options.length > 1 && (
                            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeOption(i)}>
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                ))}
                {isRequired && <p className="text-[11px] text-muted-foreground">Select a default option for required groups</p>}
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Create & Add
                </Button>
            </div>
        </div>
    )
}

// ============================================================================
// QUICK CREATE CATEGORY (Inline Dialog)
// ============================================================================

export function QuickCreateCategoryDialog({
    merchantId,
    locationId,
    onClose,
    onCreated,
}: {
    merchantId: string
    locationId?: string | null
    onClose: () => void
    onCreated: (categoryId: string, categoryName: string) => void
}) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const handleSave = async () => {
        if (!name.trim()) { toast.error('Category name is required'); return }
        setIsSaving(true)
        try {
            const result = await createAdminCategory(merchantId, {
                name: name.trim(),
                description: description.trim() || null,
                location_id: locationId || null,
                is_active: true,
            })
            if (result.error || !result.data) {
                toast.error('Failed to create category', { description: result.error })
                return
            }
            toast.success(`Category "${name}" created`)
            onCreated(result.data.id, result.data.name)
        } catch {
            toast.error('Failed to create category')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="rounded-lg border bg-background p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Quick Create Category</h4>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}><X className="h-3 w-3" /></Button>
            </div>
            <Input placeholder="Category name (e.g. Hot Drinks, Appetizers)" value={name} onChange={e => setName(e.target.value)} />
            <Textarea placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
            <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Create Category
                </Button>
            </div>
        </div>
    )
}
