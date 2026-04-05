'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CdnImageUploadField } from '@/components/ui/cdn-image-upload-field'
import {
  Loader2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Globe,
  MapPin,
  RotateCcw,
  AlertCircle,
  Flame,
  Info,
  Palette,
  Settings2,
  Tag,
} from 'lucide-react'
import { toast } from 'sonner'
import { useMerchantCdnImageUpload } from '@/lib/cdn/use-merchant-cdn-image-upload'
import { cn } from '@/lib/utils'
import { adminKeys } from '@/lib/queries/admin-keys'

import {
  createAdminCategory,
  updateAdminCategory,
  addCategoryToMenu,
  upsertAdminLocationCategoryOverride,
  deleteAdminLocationCategoryOverride,
  type AdminCategory,
} from '@/app/manage/actions/admin-merchant/menus'
import {
  assignScheduleToCategory,
  getAdminSchedules,
  getCategorySchedules,
  removeScheduleFromCategory,
} from '@/app/manage/actions/admin-merchant/schedules'
import {
  getAdminCategoryPrepDefaults,
  getAdminPrepStationsForLocation,
  removeAdminCategoryPrepDefault,
  setAdminCategoryPrepDefault,
} from '@/app/manage/actions/admin-merchant/prep-stations'

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

const EMPTY_SCHEDULES: Array<{ id: string }> = []

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
  const queryClient = useQueryClient()
  const [hasLocationOverride, setHasLocationOverride] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([])
  const [scheduleActionId, setScheduleActionId] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState({
    appearance: false,
    scheduling: false,
    advanced: false,
  })
  const imageUpload = useMerchantCdnImageUpload({
    merchantId,
    category: 'menu-categories',
    fileNamePrefix: 'category',
  })

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
  const { data: availableSchedules = [], isLoading: isLoadingSchedules } = useQuery({
    queryKey: adminKeys.merchantSchedules(merchantId, locationId),
    queryFn: () => getAdminSchedules(merchantId, locationId),
    enabled: open && !!merchantId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: assignedSchedulesData } = useQuery({
    queryKey: adminKeys.merchantCategorySchedules(merchantId, category?.id || ''),
    queryFn: () => (category ? getCategorySchedules(merchantId, category.id) : []),
    enabled: open && isEdit && !!merchantId && !!category?.id,
    staleTime: 30 * 1000,
  })
  const assignedSchedules = assignedSchedulesData ?? EMPTY_SCHEDULES

  const { data: prepStations = [] } = useQuery({
    queryKey: adminKeys.merchantPrepStations(merchantId, locationId),
    queryFn: () =>
      locationId && locationId !== 'all'
        ? getAdminPrepStationsForLocation(locationId)
        : Promise.resolve([]),
    enabled: open && isEdit && !!merchantId && !!isLocationView && !!locationId && locationId !== 'all',
    staleTime: 30 * 1000,
  })

  const { data: categoryPrepDefaults = [] } = useQuery({
    queryKey: adminKeys.merchantCategoryPrepDefaults(merchantId, locationId),
    queryFn: () =>
      locationId && locationId !== 'all'
        ? getAdminCategoryPrepDefaults(locationId)
        : Promise.resolve([]),
    enabled: open && isEdit && !!merchantId && !!isLocationView && !!locationId && locationId !== 'all',
    staleTime: 30 * 1000,
  })

  const setPrepDefaultMutation = useMutation({
    mutationFn: async (prepStationId: string) => {
      if (!category || !locationId || locationId === 'all') {
        throw new Error('Location-specific prep routing is unavailable')
      }

      const result = await setAdminCategoryPrepDefault(
        locationId,
        category.id,
        prepStationId,
        merchantId,
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to set prep station default')
      }

      return result.data
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantCategoryPrepDefaults(merchantId, locationId),
        }),
        category
          ? queryClient.invalidateQueries({
              queryKey: adminKeys.merchantCategoryWithItems(merchantId, category.id, locationId),
            })
          : Promise.resolve(),
      ])
      onSuccess()
      toast.success('Category prep station default set')
    },
    onError: (error: Error) => {
      toast.error('Failed to set category prep station', { description: error.message })
    },
  })

  const removePrepDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!category || !locationId || locationId === 'all') {
        throw new Error('Location-specific prep routing is unavailable')
      }

      const result = await removeAdminCategoryPrepDefault(locationId, category.id)

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove prep station default')
      }

      return result
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantCategoryPrepDefaults(merchantId, locationId),
        }),
        category
          ? queryClient.invalidateQueries({
              queryKey: adminKeys.merchantCategoryWithItems(merchantId, category.id, locationId),
            })
          : Promise.resolve(),
      ])
      onSuccess()
      toast.success('Category prep station default removed')
    },
    onError: (error: Error) => {
      toast.error('Failed to remove category prep station', { description: error.message })
    },
  })

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
        imageUpload.reset(category.image || null)
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
        imageUpload.reset(null)
        setHasLocationOverride(false)
        setSelectedSchedules([])
      }
    }
  }, [category, form, imageUpload.reset, isEdit, isLocationView, open])

  useEffect(() => {
    if (open && isEdit && category) {
      const nextScheduleIds = assignedSchedules.map((schedule) => schedule.id)

      setSelectedSchedules((prev) => {
        if (
          prev.length === nextScheduleIds.length &&
          prev.every((id, index) => id === nextScheduleIds[index])
        ) {
          return prev
        }

        return nextScheduleIds
      })
      return
    }

    setSelectedSchedules((prev) => (prev.length === 0 ? prev : []))
  }, [assignedSchedules, category, isEdit, open])

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const onSubmit = async (values: CategoryFormValues) => {
    let uploadedAsset: { cdnUrl: string; storagePath: string } | undefined
    let createdCategoryId: string | null = null

    try {
      const resolvedImage = await imageUpload.resolveImageValue()
      uploadedAsset = resolvedImage.uploadedAsset

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
            image: resolvedImage.value,
            is_active: values.is_active,
            display_order: values.display_order,
          })

          if (result.error) {
            if (uploadedAsset) {
              await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
            }
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
          image: resolvedImage.value,
          is_active: values.is_active,
          location_id: values.is_global ? null : locationId,
          display_order: values.display_order,
        })

        if (result.error || !result.data) {
          if (uploadedAsset) {
            await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
          }
          toast.error('Failed to create category', { description: result.error })
          return
        }

        createdCategoryId = result.data.id

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

        if (selectedSchedules.length > 0) {
          const scheduleResults = await Promise.all(
            selectedSchedules.map((scheduleId) =>
              assignScheduleToCategory(merchantId, result.data.id, scheduleId),
            ),
          )

          const failedSchedules = scheduleResults.filter((scheduleResult) => !scheduleResult.success)
          if (failedSchedules.length > 0) {
            toast.warning('Category created but some schedules were not assigned')
          }
        }
      }

      onSuccess()
      onClose()
    } catch (error) {
      if (uploadedAsset) {
        await imageUpload.cleanupUploadedAsset(uploadedAsset.storagePath).catch(console.error)
      }
      toast.error('An unexpected error occurred')
      console.error(error)
    }
  }

  const handleToggleSchedule = async (scheduleId: string) => {
    if (!isEdit || !category) {
      setSelectedSchedules((prev) =>
        prev.includes(scheduleId)
          ? prev.filter((id) => id !== scheduleId)
          : [...prev, scheduleId],
      )
      return
    }

    const isAssigned = selectedSchedules.includes(scheduleId)
    setScheduleActionId(scheduleId)

    try {
      const result = isAssigned
        ? await removeScheduleFromCategory(merchantId, category.id, scheduleId)
        : await assignScheduleToCategory(merchantId, category.id, scheduleId)

      if (!result.success) {
        toast.error('Failed to update category schedule', {
          description: result.error || undefined,
        })
        return
      }

      setSelectedSchedules((prev) =>
        isAssigned ? prev.filter((id) => id !== scheduleId) : [...prev, scheduleId],
      )

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantCategorySchedules(merchantId, category.id),
        }),
        queryClient.invalidateQueries({
          queryKey: adminKeys.merchantCategoryWithItems(merchantId, category.id, locationId),
        }),
      ])

      onSuccess()
      toast.success(isAssigned ? 'Schedule removed from category' : 'Schedule assigned to category')
    } catch (error) {
      console.error(error)
      toast.error('Failed to update category schedule')
    } finally {
      setScheduleActionId(null)
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

  const activePrepStations = prepStations.filter((station) => station.is_active)
  const currentPrepDefault = categoryPrepDefaults.find(
    (defaultValue) => defaultValue.category_id === category?.id,
  )

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        overlayClassName="bg-slate-950/40 backdrop-blur-md"
        className="w-full max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-background/95 p-0 shadow-[0_30px_100px_rgba(15,23,42,0.26)] sm:max-w-2xl"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-h-[min(90vh,860px)] flex-col">
            <DialogHeader className="gap-2 border-b border-border/70 bg-background/95 px-6 py-5 pr-14 text-left sm:text-left">
              <DialogTitle className="text-[1.625rem] font-semibold tracking-tight">
                {isEdit ? 'Edit Category' : 'Create Category'}
              </DialogTitle>
              <DialogDescription className="max-w-[52ch] text-sm leading-6">
                {isEdit
                  ? 'Update the category details below.'
                  : menuId
                    ? 'Create a new category and add it to this menu.'
                    : 'Create a new category to organize your items.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-6">
                {isEdit && isLocationView && category?.is_global && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-4 dark:border-blue-900 dark:bg-blue-950">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 text-blue-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Editing Global Category at Location
                        </p>
                        <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                          Changes will create a location-specific override. The global category remains unchanged.
                        </p>
                        {hasLocationOverride && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={handleResetToGlobal}
                            disabled={isResetting}
                          >
                            {isResetting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-2 h-4 w-4" />
                            )}
                            Reset to Global
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    Basic Information
                  </h3>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category Name *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Appetizers, Main Courses, Desserts"
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
                </div>

                <Collapsible
                  open={expandedSections.appearance}
                  onOpenChange={() => toggleSection('appearance')}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Palette className="h-4 w-4 text-pink-500" />
                        Appearance
                      </span>
                      {expandedSections.appearance ? (
                        <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                      ) : (
                        <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="image"
                      render={() => (
                        <FormItem>
                          <FormLabel>Category Image</FormLabel>
                          <FormControl>
                            <CdnImageUploadField
                              disabled={isSubmitting}
                              helperText="Uploads to Bunny CDN when you save the category."
                              onClear={imageUpload.clear}
                              onFileSelect={imageUpload.selectFile}
                              previewUrl={imageUpload.previewUrl}
                              selectedFileName={imageUpload.selectedFileName}
                              uploadLabel="Upload category image"
                              uploading={imageUpload.isUploading}
                            />
                          </FormControl>
                          <FormDescription>
                            Optional image to represent this category
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  open={expandedSections.advanced}
                  onOpenChange={() => toggleSection('advanced')}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
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
                  <CollapsibleContent className="space-y-4 pt-4">
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
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription>
                          Lower numbers appear first. Leave 0 for automatic top placement.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-xl border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Inactive categories will stay hidden from the POS.
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
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  open={expandedSections.scheduling}
                  onOpenChange={() => toggleSection('scheduling')}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <Calendar className="h-4 w-4 text-blue-500" />
                        Availability Schedule
                        {selectedSchedules.length > 0 && (
                          <Badge variant="secondary" className="ml-1">
                            {selectedSchedules.length}
                          </Badge>
                        )}
                      </span>
                      {expandedSections.scheduling ? (
                        <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                      ) : (
                        <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-4">
                  {isLoadingSchedules ? (
                    <div className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading schedules...
                    </div>
                  ) : availableSchedules.length === 0 ? (
                    <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                      No schedules exist for this merchant yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!isEdit && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                          Selected schedules will be assigned after the category is created.
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Assign schedules to control when this category is available.
                      </p>
                      {availableSchedules.map((schedule) => {
                        const isAssigned = selectedSchedules.includes(schedule.id)
                        const isPending = scheduleActionId === schedule.id

                        return (
                          <button
                            key={schedule.id}
                            type="button"
                            onClick={() => handleToggleSchedule(schedule.id)}
                            disabled={isPending}
                            className={cn(
                              'w-full rounded-xl border p-4 text-left transition-colors',
                              isAssigned
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/40',
                              isPending && 'cursor-wait opacity-70',
                            )}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium">{schedule.name}</span>
                                  <Badge variant="outline" className="bg-slate-50">
                                    {schedule.location_id ? (
                                      <>
                                        <MapPin className="mr-1 h-3 w-3" />
                                        Location
                                      </>
                                    ) : (
                                      <>
                                        <Globe className="mr-1 h-3 w-3" />
                                        Global
                                      </>
                                    )}
                                  </Badge>
                                  {!schedule.is_active && (
                                    <Badge variant="secondary">Inactive</Badge>
                                  )}
                                </div>
                                {schedule.description && (
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {schedule.description}
                                  </p>
                                )}
                              </div>
                              <div
                                className={cn(
                                  'flex h-6 w-6 items-center justify-center rounded-full border-2',
                                  isAssigned
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-muted-foreground/40 text-transparent',
                                )}
                              >
                                {isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-current" />
                                ) : (
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  </CollapsibleContent>
                </Collapsible>

                <div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-5 shadow-sm">
                  <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    <Flame className="h-4 w-4 text-orange-500" />
                    Kitchen Routing
                  </h3>
                  {!isEdit || !category ? (
                    <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                      Save the category first, then reopen it to set a default prep station.
                    </div>
                  ) : !isLocationView ? (
                    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/90 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <p>
                        Prep station routing is location-specific. Select a location to set a
                        default prep station for this category.
                      </p>
                    </div>
                  ) : activePrepStations.length === 0 ? (
                    <div className="flex items-start gap-3 rounded-xl border p-4 text-sm text-muted-foreground">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <p>
                        No prep stations are configured for this location. Create prep stations in
                        merchant settings first.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 rounded-xl border p-4">
                        <Flame className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Default Prep Station</p>
                          <p className="text-sm text-muted-foreground">
                            Items in this category inherit this prep station unless they override
                            it at the item level.
                          </p>
                        </div>
                      </div>

                      <Select
                        value={currentPrepDefault?.prep_station_id || '__none__'}
                        onValueChange={(value) => {
                          if (value === '__none__') {
                            removePrepDefaultMutation.mutate()
                            return
                          }

                          setPrepDefaultMutation.mutate(value)
                        }}
                        disabled={setPrepDefaultMutation.isPending || removePrepDefaultMutation.isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select prep station" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None (routes to Expo)</SelectItem>
                          {activePrepStations.map((station) => (
                            <SelectItem key={station.id} value={station.id}>
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: station.color }}
                                />
                                <span>{station.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <p className="text-sm text-muted-foreground">
                        Categories without a default prep station route to Expo by default.
                      </p>
                    </div>
                  )}
                </div>

                {!isEdit && (
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-5 shadow-sm">
                    {isLocationView ? (
                      <FormField
                        control={form.control}
                        name="is_global"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border p-4">
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
                      <div className="rounded-xl border p-4">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Category will be created as global (available at all locations)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isEdit && category && (
                  <div className="rounded-2xl border border-border/70 bg-background/80 p-5 shadow-sm">
                    <div className="rounded-xl border p-4">
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
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/70 bg-background/95 px-6 py-4 sm:justify-end">
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
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
