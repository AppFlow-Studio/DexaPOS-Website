'use client'

import { useEffect, useState } from 'react'
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
  ImageIcon,
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
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

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
})

type ItemFormValues = z.infer<typeof itemFormSchema>

// ============================================================================
// PROPS
// ============================================================================

interface ItemFormSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  mode: 'create' | 'edit'
  item?: AdminMenuItem | null
  categoryId?: string | null // If provided, will add item to category on create
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

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
  const hasLocationOverride = isEdit && item?.has_location_override

  // Modifier groups management state
  const [selectedModifierGroup, setSelectedModifierGroup] = useState<string>('')
  const [isAddingModifier, setIsAddingModifier] = useState(false)
  const [isRemovingModifier, setIsRemovingModifier] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Fetch all modifier groups for this merchant
  const { data: allModifierGroups } = useAdminModifierGroups(merchantId, locationId)

  // Fetch modifier groups already assigned to this item
  const { data: itemModifierGroups, isLoading: isLoadingItemModifiers } = useAdminItemModifierGroups(
    merchantId,
    isEdit ? item?.id ?? null : null
  )
  console.log(itemModifierGroups)

  // Filter out already assigned groups
  const availableModifierGroups = (allModifierGroups || []).filter(
    (g) => !itemModifierGroups?.some((ig) => ig.id === g.id)
  )

  const handleAddModifierGroup = async () => {
    if (!selectedModifierGroup || !item) return

    setIsAddingModifier(true)
    try {
      const result = await assignModifierGroupToItem(merchantId, item.id, selectedModifierGroup)

      if (!result.success) {
        toast.error('Failed to add modifier group', { description: result.error })
        return
      }

      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantItemModifiers(merchantId, item.id),
      })
      setSelectedModifierGroup('')
      toast.success('Modifier group added')
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsAddingModifier(false)
    }
  }

  const handleRemoveModifierGroup = async (groupId: string) => {
    if (!item) return

    setIsRemovingModifier(groupId)
    try {
      const result = await removeModifierGroupFromItem(merchantId, item.id, groupId)

      if (!result.success) {
        toast.error('Failed to remove modifier group', { description: result.error })
        return
      }

      queryClient.invalidateQueries({
        queryKey: adminKeys.merchantItemModifiers(merchantId, item.id),
      })
      toast.success('Modifier group removed')
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsRemovingModifier(null)
    }
  }

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
      stock_tracking_mode: null,
      available_channels: ['pos', 'online', 'kiosk'],
      override_price: null,
      override_cash_price: null,
      override_availability: true,
    },
  })

  const { isSubmitting } = form.formState
  const watchTaxExempt = form.watch('is_tax_exempt')

  // Reset form when item changes or sheet opens
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
          stock_tracking_mode: item.stock_tracking_mode as any,
          available_channels: item.available_channels || ['pos', 'online', 'kiosk'],
          // Location override values
          override_price: item.location_override?.custom_price,
          override_cash_price: item.location_override?.custom_cash_price,
          override_availability: item.location_override?.is_available ?? item.base_availability,
        })
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
          stock_tracking_mode: null,
          available_channels: ['pos', 'online', 'kiosk'],
          override_price: null,
          override_cash_price: null,
          override_availability: true,
        })
      }
    }
  }, [open, isEdit, item, form])

  const onSubmit = async (values: ItemFormValues) => {
    try {
      if (isEdit && item) {
        // If in location view, update location override
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
            toast.error('Failed to save location override', { description: overrideResult.error })
            return
          }

          toast.success('Location override saved')
        } else {
          // Update the base item
          const result = await updateAdminMenuItem(merchantId, item.id, {
            name: values.name,
            description: values.description || null,
            image: values.image || null,
            price: values.price,
            cash_price: values.cash_price,
            availability: values.availability,
            tax_category: values.tax_category,
            is_tax_exempt: values.is_tax_exempt,
            stock_tracking_mode: values.stock_tracking_mode as any,
            available_channels: values.available_channels,
          })

          if (result.error) {
            toast.error('Failed to update item', { description: result.error })
            return
          }

          toast.success('Item updated successfully')
        }
      } else {
        // Create new item
        const result = await createAdminMenuItem(merchantId, {
          name: values.name,
          description: values.description || null,
          image: values.image || null,
          price: values.price,
          cash_price: values.cash_price,
          availability: values.availability,
          tax_category: values.tax_category,
          is_tax_exempt: values.is_tax_exempt,
          stock_tracking_mode: values.stock_tracking_mode as any,
          available_channels: values.available_channels,
        })

        if (result.error || !result.data) {
          toast.error('Failed to create item', { description: result.error })
          return
        }

        // If categoryId provided, add item to category
        if (categoryId) {
          const addResult = await addItemToCategory(merchantId, categoryId, result.data.id)
          if (addResult.error) {
            toast.warning('Item created but failed to add to category', { description: addResult.error })
          } else {
            toast.success('Item created and added to category')
          }
        } else {
          toast.success('Item created successfully')
        }
      }

      onSuccess()
      onClose()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    }
  }

  const handleResetToGlobal = async () => {
    if (!item || !isLocationView || !locationId) return

    setIsResetting(true)
    try {
      const result = await deleteAdminLocationItemOverride(merchantId, locationId, item.id)

      if (!result.success) {
        toast.error('Failed to reset to global', { description: result.error })
        return
      }

      toast.success('Reset to global pricing')
      onSuccess()
      onClose()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    } finally {
      setIsResetting(false)
    }
  }
  console.log()

  return (
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent height="95">
        <BottomSheetHeader>
          <BottomSheetTitle>
            {isEdit ? 'Edit Item' : 'Create Item'}
          </BottomSheetTitle>
          <BottomSheetDescription>
            {isEdit
              ? isLocationView
                ? 'Edit location-specific settings for this item.'
                : 'Update the base item details.'
              : categoryId
                ? 'Create a new item and add it to this category.'
                : 'Create a new menu item.'}
          </BottomSheetDescription>
        </BottomSheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full overflow-y-scroll ">
            <BottomSheetBody className="space-y-6">
              {/* Location Override Warning */}
              {isEdit && isLocationView && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Location Override Mode
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        You&apos;re editing location-specific pricing and availability. Base item properties can only be edited from the global view.
                      </p>
                      {hasLocationOverride && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={handleResetToGlobal}
                          disabled={isResetting}
                        >
                          {isResetting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-2" />
                          )}
                          Reset to Global
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Basic Info Section - Only editable in global view or create mode */}
              {(!isLocationView || !isEdit) && (
                <BottomSheetSection title="Basic Information">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Grilled Chicken, Caesar Salad"
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
                          <Textarea
                            placeholder="Describe the item, ingredients, etc..."
                            rows={3}
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Image URL</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="https://example.com/image.jpg"
                              className="pl-9"
                              {...field}
                              value={field.value || ''}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </BottomSheetSection>
              )}

              {/* Show read-only item info in location view edit mode */}
              {isLocationView && isEdit && item && (
                <BottomSheetSection title="Item Information">
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      {item.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.name}
                          className="h-12 w-12 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Base Price: ${item.base_price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                </BottomSheetSection>
              )}

              {/* Pricing Section */}
              <BottomSheetSection title={isLocationView && isEdit ? 'Location Pricing' : 'Pricing'}>
                {isLocationView && isEdit ? (
                  // Location override pricing
                  <>
                    <div className="rounded-lg border p-3 mb-3 bg-muted/30">
                      <p className="text-xs text-muted-foreground">
                        Base Price: <span className="font-medium">${item?.base_price.toFixed(2)}</span>
                        {item?.base_cash_price && (
                          <> | Cash: <span className="font-medium">${item.base_cash_price.toFixed(2)}</span></>
                        )}
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="override_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location Price Override</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Leave empty to use base price"
                                className="pl-9"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              />
                            </div>
                          </FormControl>
                          <FormDescription>
                            Set a custom price for this location
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="override_cash_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location Cash Price Override</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Leave empty to use base cash price"
                                className="pl-9"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="override_availability"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Available at Location</FormLabel>
                            <FormDescription>
                              Item can be ordered at this location
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </>
                ) : (
                  // Base pricing (create or global edit)
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0.00"
                                  className="pl-9"
                                  {...field}
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
                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="Optional"
                                  className="pl-9"
                                  {...field}
                                  value={field.value ?? ''}
                                  onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Discount for cash payments
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="availability"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Available</FormLabel>
                            <FormDescription>
                              Item can be ordered
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </BottomSheetSection>

              {/* Tax & Channels - Only in global view or create */}
              {(!isLocationView || !isEdit) && (
                <>
                  <BottomSheetSection title="Tax Settings">
                    <FormField
                      control={form.control}
                      name="is_tax_exempt"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Tax Exempt</FormLabel>
                            <FormDescription>
                              No tax applied to this item
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {!watchTaxExempt && (
                      <FormField
                        control={form.control}
                        name="tax_category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tax Category</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select tax category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {TAX_CATEGORIES.map((cat) => (
                                  <SelectItem key={cat.value} value={cat.value}>
                                    {cat.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </BottomSheetSection>

                  <BottomSheetSection title="Sales Channels">
                    <FormField
                      control={form.control}
                      name="available_channels"
                      render={({ field }) => (
                        <FormItem>
                          <FormDescription className="mb-3">
                            Select where this item can be sold
                          </FormDescription>
                          <div className="grid grid-cols-3 gap-3">
                            {CHANNELS.map((channel) => {
                              const Icon = channel.icon
                              const isChecked = field.value?.includes(channel.id)

                              return (
                                <label
                                  key={channel.id}
                                  className={`
                                    flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition-all
                                    ${isChecked
                                      ? 'border-primary bg-primary/5'
                                      : 'border-muted hover:border-muted-foreground/30'
                                    }
                                  `}
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => {
                                      const newValue = checked
                                        ? [...(field.value || []), channel.id]
                                        : (field.value || []).filter((v) => v !== channel.id)
                                      field.onChange(newValue)
                                    }}
                                    className="sr-only"
                                  />
                                  <Icon className={`h-5 w-5 ${isChecked ? 'text-primary' : 'text-muted-foreground'}`} />
                                  <span className={`text-sm font-medium ${isChecked ? 'text-primary' : ''}`}>
                                    {channel.label}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </BottomSheetSection>

                  <BottomSheetSection title="Stock Tracking">
                    <FormField
                      control={form.control}
                      name="stock_tracking_mode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stock Mode</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value || null)}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="No stock tracking" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No Tracking</SelectItem>
                              {STOCK_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                  {mode.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            How to track inventory for this item
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </BottomSheetSection>
                </>
              )}

              {/* Modifier Groups Section - Only in edit mode */}
              {isEdit && item && (
                <BottomSheetSection title="Modifier Groups">
                  <p className="text-sm text-muted-foreground mb-3">
                    Attach modifier groups to allow customers to customize this item.
                  </p>

                  {/* Currently assigned modifiers */}
                  {isLoadingItemModifiers ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    </div>
                  ) : itemModifierGroups && itemModifierGroups.length > 0 ? (
                    <div className="space-y-2 mb-4">
                      {itemModifierGroups.map((group) => (
                        <div
                          key={group.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <Sliders className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium text-sm">{group.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {group.items_count} option{group.items_count !== 1 ? 's' : ''}
                                {group.is_required && (
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    Required
                                  </Badge>
                                )}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveModifierGroup(group.id)}
                            disabled={isRemovingModifier === group.id}
                          >
                            {isRemovingModifier === group.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">
                      No modifier groups attached.
                    </p>
                  )}

                  {/* Add modifier group dropdown */}
                  {availableModifierGroups.length > 0 && (
                    <div className="flex gap-2">
                      <Select
                        value={selectedModifierGroup}
                        onValueChange={setSelectedModifierGroup}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select a modifier group..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableModifierGroups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name} ({group.items_count} option
                              {group.items_count !== 1 ? 's' : ''})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={handleAddModifierGroup}
                        disabled={!selectedModifierGroup || isAddingModifier}
                      >
                        {isAddingModifier ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {availableModifierGroups.length === 0 && allModifierGroups && allModifierGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No modifier groups have been created yet. Create modifier groups first to attach them to items.
                    </p>
                  )}
                </BottomSheetSection>
              )}
            </BottomSheetBody>

            <BottomSheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEdit
                  ? isLocationView
                    ? 'Save Override'
                    : 'Save Changes'
                  : 'Create Item'}
              </Button>
            </BottomSheetFooter>
          </form>
        </Form>
      </BottomSheetContent>
    </BottomSheet>
  )
}
