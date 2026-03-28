'use client'

import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetSection,
} from '@/components/ui/bottom-sheet'
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
  Info,
  Building2,
  ChefHat,
  Receipt,
  Calendar,
  Lock,
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
  type AdminMenuItem,
  type AdminMenuItemModifierGroup,
} from '@/app/manage/actions/admin-merchant/menus'

import {
  useAdminModifierGroups,
  useAdminItemModifierGroups,
} from '@/lib/queries/use-admin-merchant'
import { adminKeys } from '@/lib/queries/admin-keys'
import { useMerchantDetails } from '@/lib/queries/use-merchants'
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

// ============================================================================
// SCHEMA
// ============================================================================

const itemFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(1000, 'Description too long').optional().nullable(),
  image: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  price: z.coerce.number().min(0, 'Price must be positive'),
  cash_price: z.coerce.number().min(0, 'Cash price must be positive').optional().nullable(),
  availability: z.boolean().default(true),
  tax_category: z.string().default('standard'),
  is_tax_exempt: z.boolean().default(false),
  stock_tracking_mode: z.enum(['in_stock', 'out_of_stock', 'quantity']).nullable().optional(),
  available_channels: z.array(z.string()).default(['pos', 'online', 'kiosk']),
  // Location override fields
  override_price: z.coerce.number().min(0).optional().nullable(),
  override_cash_price: z.coerce.number().min(0).optional().nullable(),
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
  const hasLocationOverride = isEdit && item?.has_location_override
  const queryClient = useQueryClient()
  const itemImageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: 'menu-items',
    fileNamePrefix: 'item',
  })

  // Fetch merchant details for location names
  const { data: merchantDetails } = useMerchantDetails(merchantId)
  const currentLocationName = isLocationView 
    ? merchantDetails?.locations.find((l) => l.id === locationId)?.name || 'This Location'
    : 'All Locations'

  // Form definition
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      price: 0,
      cash_price: null,
      availability: true,
      tax_category: 'standard',
      is_tax_exempt: false,
      stock_tracking_mode: 'in_stock',
      available_channels: ['pos', 'online', 'kiosk'],
      override_price: null,
      override_cash_price: null,
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
          availability: item.base_availability,
          tax_category: item.tax_category || 'standard',
          is_tax_exempt: item.is_tax_exempt,
          stock_tracking_mode: (item.stock_tracking_mode || 'in_stock') as any,
          available_channels: item.available_channels || ['pos', 'online', 'kiosk'],
          override_price: item.location_override?.custom_price,
          override_cash_price: item.location_override?.custom_cash_price,
          override_availability: item.location_override?.is_available ?? item.base_availability,
        })
        itemImageUpload.reset(item.image || null)
      } else {
        form.reset({
          name: '',
          description: '',
          image: '',
          price: 0,
          cash_price: null,
          availability: true,
          tax_category: 'standard',
          is_tax_exempt: false,
          stock_tracking_mode: 'in_stock',
          available_channels: ['pos', 'online', 'kiosk'],
          override_price: null,
          override_cash_price: null,
          override_availability: true,
          modifier_group_ids: [],
        })
        itemImageUpload.reset(null)
        setNewModifierIds([])
      }
    }
  }, [form, isEdit, item, itemImageUpload.reset, open])

  // Handlers
  const onSubmit = async (values: ItemFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined

    try {
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
          image: resolvedImage.value,
          price: values.price,
          cash_price: values.cash_price,
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
        if (categoryId) {
          await addItemToCategory(merchantId, categoryId, result.data.id)
        }
        toast.success('Item created successfully')
      }
      // Force refresh of the items list
      queryClient.invalidateQueries({ queryKey: adminKeys.merchantMenuItems(merchantId, locationId).slice(0, -1) })
      // If we added to a category, might need to invalidate categories too
      if (categoryId) {
           queryClient.invalidateQueries({ queryKey: adminKeys.merchantCategories(merchantId, locationId) })
           // Also specific category details if needed
           queryClient.invalidateQueries({ queryKey: ['admin', 'merchant', 'category', categoryId] })
      }
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
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent height="95">
        <BottomSheetHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <BottomSheetTitle className="flex items-center gap-2">
                {isEdit ? 'Edit Menu Item' : 'New Menu Item'}
                {isLocationView && (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                        <MapPin className="h-3 w-3 mr-1" />
                        {currentLocationName} Override
                    </Badge>
                )}
              </BottomSheetTitle>
              <BottomSheetDescription>
                {isLocationView 
                    ? "Editing location pricing. This price applies to ALL menus at this location."
                    : "Configure item details, pricing, and availability."
                }
              </BottomSheetDescription>
            </div>
          </div>
        </BottomSheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <div className="flex h-full flex-col md:flex-row overflow-hidden">
                {/* LEFT COLUMN - FORM */}
                <div className="flex-1 overflow-y-auto p-6">
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
                                    <FormField
                                        control={form.control}
                                        name="image"
                                        render={() => (
                                            <FormItem>
                                                <FormLabel>Item Image</FormLabel>
                                                <FormControl>
                                                    <CdnImageUploadField
                                                        disabled={form.formState.isSubmitting}
                                                        helperText="Uploads to Bunny CDN when you save the item."
                                                        onClear={itemImageUpload.clear}
                                                        onFileSelect={itemImageUpload.selectFile}
                                                        previewUrl={itemImageUpload.previewUrl}
                                                        selectedFileName={itemImageUpload.selectedFileName}
                                                        uploadLabel="Upload item image"
                                                        uploading={itemImageUpload.isUploading}
                                                    />
                                                </FormControl>
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
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-6">
                                        <FormField
                                            control={form.control}
                                            name="price"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Base Price *</FormLabel>
                                                    <FormControl>
                                                        <div className="relative">
                                                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                            <Input type="number" step="0.01" min="0" className="pl-9" {...field} />
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
                                                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                            <Input type="number" step="0.01" min="0" className="pl-9" placeholder="Optional" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} />
                                                        </div>
                                                    </FormControl>
                                                    <FormDescription>Discounted price for cash payments</FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
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
                <div className="hidden lg:block w-[350px] border-l bg-muted/10 p-6 overflow-y-auto">
                    <div className="sticky top-0">
                        <div className="flex items-center gap-2 mb-4 text-sm font-medium text-muted-foreground">
                            <Monitor className="h-4 w-4" /> POS Preview
                        </div>
                        <ItemPreviewCard
                            name={watchedValues.name || 'New Item'}
                            description={watchedValues.description || ''}
                            price={isLocationView && isEdit ? (watchedValues.override_price ?? watchedValues.price) : watchedValues.price}
                            cashPrice={(isLocationView && isEdit ? (watchedValues.override_cash_price ?? watchedValues.cash_price) : watchedValues.cash_price) ?? undefined}
                            image={itemImageUpload.previewUrl || undefined}
                            availability={isLocationView && isEdit ? (watchedValues.override_availability ?? true) : watchedValues.availability}
                            categories={item?.categories?.map(c => c.name)}
                        />
                         <div className="mt-8">
                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                                <Tag className="h-4 w-4" /> Allergens
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {['Eggs', 'Dairy', 'Wheat'].map(a => (
                                    <Badge key={a} variant="outline" className="opacity-50">{a}</Badge>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Allergens are managed in global settings.</p>
                        </div>
                    </div>
                </div>
            </div>

            <BottomSheetFooter className="border-t pt-4 mt-auto z-10 bg-background">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Create Item'}
              </Button>
            </BottomSheetFooter>
          </form>
        </Form>
      </BottomSheetContent>
    </BottomSheet>
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
    )
}
