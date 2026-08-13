'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Loader2,
  Globe,
  MapPin,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  DollarSign,
  ChevronRight,
  Settings2,
  Edit3,
  Sparkles,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import {
  createAdminModifierGroup,
  updateAdminModifierGroup,
  createAdminModifierItem,
  updateAdminModifierItem,
  deleteAdminModifierItem,
  type AdminModifierGroup,
  type AdminModifierItem,
} from '@/app/manage/actions/admin-merchant/menus'
import { adminKeys } from '@/lib/queries/admin-keys'
import { ModifierRecipeManager } from '@/app/dashboard/menu/components/ModifierRecipeManager'

// ============================================================================
// SCHEMA
// ============================================================================

const modifierGroupFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional().nullable(),
  is_required: z.boolean().default(false),
  min_selections: z.coerce.number().int().min(0).default(0),
  max_selections: z.coerce.number().int().min(1).nullable().optional(),
  is_active: z.boolean().default(true),
  is_global: z.boolean().default(true),
})

const optionSchema = z.object({
  name: z.string().min(1, 'Option name is required'),
  description: z.string().optional().nullable(),
  price_modifier: z.preprocess(
    (value) => {
      if (value === '' || value === null || value === undefined) return 0
      if (typeof value === 'string') return Number(value)
      return value
    },
    z.number().finite().default(0)
  ),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  display_order: z.coerce.number().int().min(0).default(0),
})

type ModifierGroupFormValues = z.infer<typeof modifierGroupFormSchema>
type OptionFormValues = z.infer<typeof optionSchema>

interface TempOption {
  id: string
  name: string
  description?: string | null
  price_modifier: number
  display_order?: number
  is_active: boolean
  is_default: boolean
  isNew: boolean
  isDeleted?: boolean
}

// ============================================================================
// PROPS
// ============================================================================

interface ModifierFormSheetProps {
  open: boolean
  onClose: () => void
  merchantId: string
  locationId: string | null
  mode: 'create' | 'edit'
  group?: AdminModifierGroup | null
  groupDetails?: {
    items: AdminModifierItem[]
  } | null
  onSuccess: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ModifierFormSheet({
  open,
  onClose,
  merchantId,
  locationId,
  mode,
  group,
  groupDetails,
  onSuccess,
}: ModifierFormSheetProps) {
  const isEdit = mode === 'edit'
  const isLocationView = locationId && locationId !== 'all'
  const queryClient = useQueryClient()

  // State
  const [options, setOptions] = useState<TempOption[]>([])
  const [isAddOptionSheetOpen, setIsAddOptionSheetOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<TempOption | null>(null)
  
  const form = useForm<ModifierGroupFormValues>({
    resolver: zodResolver(modifierGroupFormSchema),
    defaultValues: {
      name: '',
      description: '',
      is_required: false,
      min_selections: 0,
      max_selections: null,
      is_active: true,
      is_global: true,
    },
  })

  const optionForm = useForm<OptionFormValues>({
    resolver: zodResolver(optionSchema),
    defaultValues: {
      name: '',
      description: '',
      price_modifier: 0,
      is_default: false,
      is_active: true,
      display_order: 0,
    },
  })

  const { isSubmitting } = form.formState

  const normalizeDisplayOrder = (items: TempOption[]) =>
    items.map((option, index) => ({
      ...option,
      display_order: index,
    }))

  // Reset form when group changes or sheet opens
  useEffect(() => {
    if (open) {
      if (isEdit && group) {
        form.reset({
          name: group.name,
          description: group.description || '',
          is_required: group.is_required,
          min_selections: group.min_selections,
          max_selections: group.max_selections,
          is_active: group.is_active,
          is_global: group.is_global,
        })
        
        if (groupDetails?.items) {
          setOptions(
            [...groupDetails.items]
              .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((item) => ({
              id: item.id,
              name: item.name,
              description: item.description,
              price_modifier: Number(item.price_modifier),
              display_order: item.display_order,
              is_active: item.is_active,
              is_default: item.is_default,
              isNew: false,
            }))
          )
        }
      } else {
        form.reset({
          name: '',
          description: '',
          is_required: false,
          min_selections: 0,
          max_selections: null,
          is_active: true,
          is_global: !isLocationView,
        })
        setOptions([])
      }
    }
  }, [open, isEdit, group, groupDetails, form, isLocationView])

  const handleAddOption = (values: OptionFormValues) => {
    // If setting as default, unset other defaults
    if (values.is_default) {
      setOptions((prev) => prev.map((opt) => ({ ...opt, is_default: false })))
    }

    if (editingOption) {
      setOptions((prev) =>
        normalizeDisplayOrder(
          prev
            .map((opt) =>
              opt.id === editingOption.id
                ? {
                    ...opt,
                    name: values.name,
                    description: values.description,
                    price_modifier: values.price_modifier,
                    display_order: values.display_order ?? opt.display_order ?? 0,
                    is_active: values.is_active,
                    is_default: values.is_default,
                  }
                : opt
            )
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        )
      )
      setEditingOption(null)
    } else {
      setOptions((prev) =>
        normalizeDisplayOrder([
          ...prev,
          {
            id: `temp-${Date.now()}`,
            name: values.name,
            description: values.description,
            price_modifier: values.price_modifier,
            display_order: values.display_order ?? prev.length,
            is_active: values.is_active,
            is_default: values.is_default,
            isNew: true,
          },
        ])
      )
    }
    optionForm.reset()
    setIsAddOptionSheetOpen(false)
  }

  const handleEditOption = (option: TempOption) => {
    setEditingOption(option)
    optionForm.reset({
      name: option.name,
      description: option.description || '',
      price_modifier: option.price_modifier,
      display_order: option.display_order ?? 0,
      is_active: option.is_active,
      is_default: option.is_default,
    })
    setIsAddOptionSheetOpen(true)
  }

  const handleDeleteOption = (optionId: string) => {
    const item = options.find((opt) => opt.id === optionId)
    if (!item) return
    if (item.isNew) {
      // New items that haven't been saved - just remove from list
      setOptions((prev) => normalizeDisplayOrder(prev.filter((opt) => opt.id !== optionId)))
    } else {
      // Existing items - mark as deleted
      setOptions((prev) =>
        normalizeDisplayOrder(
          prev.map((opt) => (opt.id === optionId ? { ...opt, isDeleted: true } : opt))
        )
      )
    }
  }

  const handleMoveOption = (optionId: string, direction: 'up' | 'down') => {
    setOptions((prev) => {
      const visible = prev
        .filter((item) => !item.isDeleted)
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      const currentIndex = visible.findIndex((item) => item.id === optionId)
      if (currentIndex < 0) return prev

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= visible.length) return prev

      const reordered = [...visible]
      const [moved] = reordered.splice(currentIndex, 1)
      reordered.splice(targetIndex, 0, moved)

      const orderMap = new Map(reordered.map((item, index) => [item.id, index]))

      return prev.map((item) =>
        item.isDeleted
          ? item
          : {
              ...item,
              display_order: orderMap.get(item.id) ?? item.display_order ?? 0,
            }
      )
    })
  }

  const onSubmit = async (values: ModifierGroupFormValues) => {
    try {
      let groupId: string

      if (isEdit && group) {
        // Update existing group
        const result = await updateAdminModifierGroup(merchantId, group.id, {
          name: values.name,
          description: values.description || null,
          is_required: values.is_required,
          min_selections: values.min_selections,
          max_selections: values.max_selections,
          is_active: values.is_active,
        })

        if (result.error) {
          toast.error('Failed to update modifier group', { description: result.error })
          return
        }

        groupId = group.id
        toast.success('Modifier group updated')
      } else {
        // Create new group
        const result = await createAdminModifierGroup(merchantId, {
          name: values.name,
          description: values.description || null,
          is_required: values.is_required,
          min_selections: values.min_selections,
          max_selections: values.max_selections,
          location_id: values.is_global ? null : locationId,
          is_active: values.is_active,
        })

        if (result.error || !result.data) {
          toast.error('Failed to create modifier group', { description: result.error })
          return
        }

        groupId = result.data.id
        toast.success('Modifier group created')
      }

      const orderedVisibleItems = normalizeDisplayOrder(
        [...options]
          .filter((item) => !item.isDeleted)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      )
      const orderedVisibleMap = new Map(
        orderedVisibleItems.map((item, index) => [item.id, index])
      )

      // Handle modifier items
      for (const item of options) {
        if (item.isDeleted && !item.isNew) {
          // Delete existing item
          await deleteAdminModifierItem(merchantId, item.id)
        } else if (item.isNew && !item.isDeleted) {
          // Create new item
          await createAdminModifierItem(merchantId, groupId, {
            name: item.name,
            description: item.description || null,
            price_modifier: item.price_modifier,
            is_default: item.is_default,
            is_active: item.is_active,
            display_order: orderedVisibleMap.get(item.id) ?? 0,
          })
        } else if (!item.isNew && !item.isDeleted) {
          // Update existing item
          await updateAdminModifierItem(merchantId, item.id, {
            name: item.name,
            description: item.description || null,
            price_modifier: item.price_modifier,
            is_default: item.is_default,
            is_active: item.is_active,
            display_order: orderedVisibleMap.get(item.id) ?? 0,
          })
        }
      }

      // Invalidate queries
      await queryClient.invalidateQueries({
        queryKey: adminKeys.merchantModifiers(merchantId, locationId),
      })

      onSuccess()
      onClose()
    } catch (error) {
      toast.error('An unexpected error occurred')
      console.error(error)
    }
  }

  const visibleItems = [...options]
    .filter(item => !item.isDeleted)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  return (
    <>
      <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <BottomSheetContent className="!h-[95vh]">
          <BottomSheetHeader>
            <BottomSheetTitle className="flex items-center gap-2">
              {isEdit ? 'Edit Modifier Group' : 'Create Modifier Group'}
            </BottomSheetTitle>
            <BottomSheetDescription>
              {isEdit
                ? 'Update the modifier group and its options below.'
                : 'Create a new modifier group with customization options.'}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <BottomSheetBody className="p-0 overflow-hidden">
                <div className="flex flex-col lg:flex-row h-full gap-6 p-6 overflow-hidden">
                  {/* Form Section */}
                  <div className="w-full lg:w-2/3 h-full overflow-y-auto space-y-6 pr-2 pb-20">
                    
                    {/* Basic Info */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <MapPin className="h-4 w-4" /> 
                        Basic Information
                      </h3>

                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Group Name *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Size, Toppings, Add-ons"
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
                                placeholder="Brief description of this modifier group..."
                                rows={2}
                                className="resize-none"
                                {...field}
                                value={field.value || ''}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Selection Rules */}
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-blue-500" />
                            Selection Rules
                          </span>
                          <ChevronRight className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-90" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-4">
                        <FormField
                          control={form.control}
                          name="is_required"
                          render={({ field }) => (
                            <FormItem className="flex min-w-0 items-center justify-between gap-4 overflow-hidden rounded-lg border p-4">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <FormLabel className="text-base">Required</FormLabel>
                                <FormDescription>
                                  Customer must select an option
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  className="shrink-0"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="min_selections"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Min Selections</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={0}
                                    {...field}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Minimum required
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="max_selections"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Max Selections</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Unlimited"
                                    {...field}
                                    value={field.value ?? ''}
                                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Empty = unlimited
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Modifier Options */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Options ({visibleItems.length})
                        </h3>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingOption(null)
                            optionForm.reset()
                            setIsAddOptionSheetOpen(true)
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Option
                        </Button>
                      </div>

                      {visibleItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-8 text-center bg-muted/20">
                          <p className="text-sm text-muted-foreground">
                            No options added yet. Click "Add Option" to create modifier choices.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {visibleItems.map((item, index) => {
                            if (item.isDeleted) return null

                            return (
                              <div
                                key={item.id}
                                className={cn(
                                  "flex items-center gap-3 p-3 rounded-lg border transition-all duration-200",
                                  "hover:shadow-md group",
                                  item.is_active ? "bg-card" : "bg-muted/50 opacity-60"
                                )}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{item.name}</span>
                                    {item.isNew && (
                                      <Badge variant="secondary" className="text-xs">New</Badge>
                                    )}
                                    {item.is_default && (
                                      <Badge variant="default" className="text-xs bg-yellow-500 text-white hover:bg-yellow-600">Default</Badge>
                                    )}
                                  </div>
                                  {item.description && (
                                    <p className="text-sm text-muted-foreground truncate">{item.description}</p>
                                  )}
                                </div>

                                <div className="text-right shrink-0">
                                  <span className={cn(
                                    "font-semibold",
                                    item.price_modifier > 0 ? "text-green-600" : item.price_modifier < 0 ? "text-red-500" : "text-muted-foreground"
                                  )}>
                                    {item.price_modifier > 0 ? "+" : ""}${item.price_modifier.toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={index === 0}
                                    onClick={() => handleMoveOption(item.id, 'up')}
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={index === visibleItems.length - 1}
                                    onClick={() => handleMoveOption(item.id, 'down')}
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditOption(item)}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteOption(item.id)}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Settings */}
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <span className="text-sm font-semibold flex items-center gap-2">
                            <Globe className="h-4 w-4 text-blue-500" />
                            Settings
                          </span>
                          <ChevronRight className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-90" />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 space-y-4">
                        <FormField
                            control={form.control}
                            name="is_active"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">Active</FormLabel>
                                  <FormDescription>
                                    Modifier group is available for use
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

                          {/* Scope - only show on create */}
                          {!isEdit && (
                            isLocationView ? (
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
                                            Global
                                          </>
                                        ) : (
                                          <>
                                            <MapPin className="h-4 w-4" />
                                            Location
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
                                    Modifier group will be created as global (available at all locations)
                                  </span>
                                </div>
                              </div>
                            )
                          )}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>

                  {/* Preview Section */}
                  <div className="hidden lg:block w-1/3 bg-muted/10 rounded-xl p-6 border h-fit sticky top-0">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Preview
                    </h3>

                    <div className="bg-card rounded-xl border-2 border-border/50 p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className={`text-lg font-semibold transition-colors duration-200 ${form.watch('name') ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                            {form.watch('name') || "Group Name"}
                          </h4>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] h-5">Optional</Badge>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {form.watch('is_required') ? (
                            <Badge variant="destructive" className="rounded-sm">Required</Badge>
                          ) : (
                            <Badge variant="secondary" className="rounded-sm">Optional</Badge>
                          )}
                        </div>
                      </div>
                      
                      {form.watch('description') && (
                        <p className="text-sm text-muted-foreground mb-4">
                          {form.watch('description')}
                        </p>
                      )}

                      <div className="text-xs text-muted-foreground mb-3 font-medium">
                        Select {form.watch('min_selections') > 0 ? form.watch('min_selections') : 'any'}
                        {form.watch('max_selections') ? ` to ${form.watch('max_selections')}` : form.watch('min_selections') > 0 ? ' or more' : ''}
                      </div>

                      {visibleItems.length > 0 && (
                        <div className="space-y-3 border-t pt-3">
                          {visibleItems.map((item) => (
                              <div key={item.id} className={`flex items-center justify-between ${!item.is_active ? 'opacity-50' : ''}`}>
                                  <div className="flex items-center gap-2">
                                      <div className="h-4 w-4 rounded-full border border-primary/20"></div>
                                      <span className="text-sm">{item.name}</span>
                                      {item.is_default && (
                                          <Badge variant="secondary" className="text-[10px] h-4 px-1">Default</Badge>
                                      )}
                                  </div>
                                  <span className="text-sm font-medium">
                                      {item.price_modifier > 0 ? '+' : ''}${item.price_modifier.toFixed(2)}
                                  </span>
                              </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </BottomSheetBody>

              <BottomSheetFooter className="p-6 border-t mt-auto bg-background">
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
                  {isEdit ? 'Save Changes' : 'Create Modifier Group'}
                </Button>
              </BottomSheetFooter>
            </form>
          </Form>
        </BottomSheetContent>
      </BottomSheet>

      {/* Nested Sheet for Adding/Editing Options */}
      <BottomSheet
        open={isAddOptionSheetOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingOption(null);
            optionForm.reset();
          }
          setIsAddOptionSheetOpen(open);
        }}
      >
        <BottomSheetContent height="auto" className="!rounded-t-[24px]">
          <BottomSheetHeader>
            <BottomSheetTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-green-500" />
              {editingOption ? "Edit Option" : "Add Option"}
            </BottomSheetTitle>
            <BottomSheetDescription>
              {editingOption
                ? "Update this modifier option"
                : "Add a new option to this modifier group"}
            </BottomSheetDescription>
          </BottomSheetHeader>

          <BottomSheetBody className="">
            <Form {...optionForm}>
              <form
                id="option-form"
                onSubmit={optionForm.handleSubmit(handleAddOption)}
                className="space-y-4"
              >
                <FormField
                  control={optionForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Option Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Small, Medium, Large"
                          className="h-12"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={optionForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional description" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={optionForm.control}
                  name="price_modifier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price Adjustment</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            className="pl-7"
                            placeholder="0.00"
                            {...field}
                            value={field.value === '' ? '' : field.value}
                            onChange={(e) =>
                              field.onChange(e.target.value === '' ? '' : e.target.value)
                            }
                            onBlur={(e) => {
                              const nextValue = e.target.value.trim()
                              field.onChange(nextValue === '' ? 0 : Number(nextValue))
                              field.onBlur()
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Enter 0 for no change, positive for upcharge, negative
                        for discount
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={optionForm.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex min-w-0 items-center justify-between gap-4 overflow-hidden rounded-lg border p-4">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Inactive options won&apos;t appear in the POS
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="shrink-0"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Set Default */}
                <FormField
                  control={optionForm.control}
                  name="is_default"
                  render={({ field }) => (
                    <FormItem className="flex min-w-0 items-center justify-between gap-4 overflow-hidden rounded-lg border p-4 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-yellow-600" />
                          Set as Default
                        </FormLabel>
                        <FormDescription>
                          This option will be pre-selected automatically when ordering
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                           checked={field.value}
                           onCheckedChange={(checked) => {
                             field.onChange(checked);
                           }}
                           className={cn(
                             "shrink-0 data-[state=checked]:bg-yellow-500",
                           )}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {/* Recipe Manager Section */}
            <div className="pt-4 mt-2 border-t">
              {editingOption && !editingOption.isNew ? (
                <ModifierRecipeManager
                  modifierItemId={editingOption.id}
                  modifierItemName={editingOption.name}
                  merchantId={merchantId}
                  locationId={locationId}
                  isEditable={true}
                />
              ) : (
                <div className="bg-muted/30 p-4 rounded-lg text-center border border-dashed">
                  <p className="text-sm font-medium">Recipe Management</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please save the option first to add recipe ingredients.
                  </p>
                </div>
              )}
            </div>
          </BottomSheetBody>

          <BottomSheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddOptionSheetOpen(false);
                setEditingOption(null);
                optionForm.reset();
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" form="option-form" className="flex-1">
              {editingOption ? "Update Option" : "Add Option"}
            </Button>
          </BottomSheetFooter>
        </BottomSheetContent>
      </BottomSheet>
    </>
  )
}
