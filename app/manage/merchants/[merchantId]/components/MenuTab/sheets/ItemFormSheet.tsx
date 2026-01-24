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
} from 'lucide-react'
import { toast } from 'sonner'

import {
  createAdminMenuItem,
  updateAdminMenuItem,
  addItemToCategory,
  upsertAdminLocationItemOverride,
  deleteAdminLocationItemOverride,
  type AdminMenuItem,
} from '@/app/manage/actions/admin-merchant/menus'

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
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
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
