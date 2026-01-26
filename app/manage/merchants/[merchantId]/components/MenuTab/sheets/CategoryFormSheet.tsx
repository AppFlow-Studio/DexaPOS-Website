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
import { Separator } from '@/components/ui/separator'
import {
  Loader2,
  Globe,
  MapPin,
  ImageIcon,
  RotateCcw,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  createAdminCategory,
  updateAdminCategory,
  addCategoryToMenu,
  upsertAdminLocationCategoryOverride,
  deleteAdminLocationCategoryOverride,
  type AdminCategory,
} from '@/app/manage/actions/admin-merchant/menus'

// ============================================================================
// SCHEMA
// ============================================================================

const categoryFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional().nullable(),
  image: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
  is_active: z.boolean().default(true),
  is_global: z.boolean().default(true),
  display_order: z.coerce.number().int().min(0).default(0),
})

type CategoryFormValues = z.infer<typeof categoryFormSchema>

// ============================================================================
// PROPS
// ============================================================================

interface CategoryFormSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  mode: 'create' | 'edit'
  category?: AdminCategory | null
  menuId?: string | null // If provided, will add category to menu on create
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CategoryFormSheet({
  open,
  onClose,
  merchantId,
  locationId,
  mode,
  category,
  menuId,
  onSuccess,
}: CategoryFormSheetProps) {
  const isEdit = mode === 'edit'
  const isLocationView = locationId && locationId !== 'all'
  const [hasLocationOverride, setHasLocationOverride] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      is_active: true,
      is_global: true,
      display_order: 0,
    },
  })

  const { isSubmitting } = form.formState

  // Reset form when category changes or sheet opens
  useEffect(() => {
    if (open) {
      if (isEdit && category) {
        form.reset({
          name: category.name,
          description: category.description || '',
          image: category.image || '',
          is_active: category.is_active,
          is_global: category.is_global,
          display_order: category.display_order || 0,
        })
        // Check if category has a location override (this would come from extended data)
        setHasLocationOverride(false) // Will be set based on actual override data
      } else {
        form.reset({
          name: '',
          description: '',
          image: '',
          is_active: true,
          is_global: !isLocationView,
          display_order: 0,
        })
        setHasLocationOverride(false)
      }
    }
  }, [open, isEdit, category, form, isLocationView])

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      if (isEdit && category) {
        // If we're in location view and editing a global category,
        // create/update a location override instead of updating the global category
        if (isLocationView && category.is_global && locationId) {
          const result = await upsertAdminLocationCategoryOverride(
            merchantId,
            locationId,
            category.id,
            {
              is_active: values.is_active,
              display_order: values.display_order,
              custom_title: values.name !== category.name ? values.name : null,
            }
          )

          if (!result.success) {
            toast.error('Failed to update location override', { description: result.error })
            return
          }

          toast.success('Location override saved')
        } else {
          // Update the category directly
          const result = await updateAdminCategory(merchantId, category.id, {
            name: values.name,
            description: values.description || null,
            image: values.image || null,
            is_active: values.is_active,
            display_order: values.display_order,
          })

          if (result.error) {
            toast.error('Failed to update category', { description: result.error })
            return
          }

          toast.success('Category updated successfully')
        }
      } else {
        // Create new category
        const result = await createAdminCategory(merchantId, {
          name: values.name,
          description: values.description || null,
          image: values.image || null,
          is_active: values.is_active,
          location_id: values.is_global ? null : locationId,
          display_order: values.display_order,
        })

        if (result.error || !result.data) {
          toast.error('Failed to create category', { description: result.error })
          return
        }

        // If menuId provided, add category to menu
        if (menuId) {
          const addResult = await addCategoryToMenu(merchantId, menuId, result.data.id)
          if (addResult.error) {
            toast.warning('Category created but failed to add to menu', { description: addResult.error })
          } else {
            toast.success('Category created and added to menu')
          }
        } else {
          toast.success('Category created successfully')
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
    if (!category || !isLocationView || !locationId) return

    setIsResetting(true)
    try {
      const result = await deleteAdminLocationCategoryOverride(merchantId, locationId, category.id)

      if (!result.success) {
        toast.error('Failed to reset to global', { description: result.error })
        return
      }

      toast.success('Reset to global settings')
      setHasLocationOverride(false)
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
      <BottomSheetContent height="auto">
        <BottomSheetHeader>
          <BottomSheetTitle>
            {isEdit ? 'Edit Category' : 'Create Category'}
          </BottomSheetTitle>
          <BottomSheetDescription>
            {isEdit
              ? 'Update the category details below.'
              : menuId
                ? 'Create a new category and add it to this menu.'
                : 'Create a new category to organize your items.'}
          </BottomSheetDescription>
        </BottomSheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <BottomSheetBody className="space-y-6">
              {/* Location Override Warning */}
              {isEdit && isLocationView && category?.is_global && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Editing Global Category at Location
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        Changes will create a location-specific override. The global category remains unchanged.
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

              {/* Basic Info Section */}
              <BottomSheetSection title="Basic Information">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Appetizers, Main Courses, Desserts"
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
                          placeholder="Brief description of this category..."
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
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <ImageIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="https://example.com/image.jpg"
                              className="pl-9"
                              {...field}
                              value={field.value || ''}
                            />
                          </div>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Optional image for this category
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </BottomSheetSection>

              {/* Display Settings */}
              <BottomSheetSection title="Display Settings">
                <FormField
                  control={form.control}
                  name="display_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Lower numbers appear first (0 = top)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Category is visible in menus
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
              </BottomSheetSection>

              {/* Scope Section - only show on create */}
              {!isEdit && (
                <BottomSheetSection title="Scope">
                  {isLocationView ? (
                    <FormField
                      control={form.control}
                      name="is_global"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base flex items-center gap-2">
                              {field.value ? (
                                <>
                                  <Globe className="h-4 w-4" />
                                  Global Category
                                </>
                              ) : (
                                <>
                                  <MapPin className="h-4 w-4" />
                                  Location Category
                                </>
                              )}
                            </FormLabel>
                            <FormDescription>
                              {field.value
                                ? 'Available across all locations'
                                : 'Only available at the selected location'}
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
                  ) : (
                    <div className="rounded-lg border p-4">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Category will be created as global (available at all locations)
                        </span>
                      </div>
                    </div>
                  )}
                </BottomSheetSection>
              )}

              {/* Show current scope badge in edit mode */}
              {isEdit && category && (
                <BottomSheetSection title="Scope">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Category Scope</p>
                        <p className="text-sm text-muted-foreground">
                          {category.is_global
                            ? 'This category is available across all locations'
                            : `This category is specific to ${category.location_name || 'a location'}`}
                        </p>
                      </div>
                      <Badge variant="outline" className={category.is_global ? 'bg-slate-50' : 'bg-blue-50 text-blue-700'}>
                        {category.is_global ? (
                          <>
                            <Globe className="h-3 w-3 mr-1" />
                            Global
                          </>
                        ) : (
                          <>
                            <MapPin className="h-3 w-3 mr-1" />
                            Location
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
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
                {isEdit ? 'Save Changes' : 'Create Category'}
              </Button>
            </BottomSheetFooter>
          </form>
        </Form>
      </BottomSheetContent>
    </BottomSheet>
  )
}
