'use client'

import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Loader2,
  Globe,
  MapPin,
  Plus,
  Trash2,
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'

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

// ============================================================================
// SCHEMA
// ============================================================================

const modifierItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Option name is required'),
  description: z.string().optional().nullable(),
  price_modifier: z.coerce.number().default(0),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  display_order: z.coerce.number().int().min(0).default(0),
  _isNew: z.boolean().optional(),
  _isDeleted: z.boolean().optional(),
})

const modifierGroupFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional().nullable(),
  is_required: z.boolean().default(false),
  min_selections: z.coerce.number().int().min(0).default(0),
  max_selections: z.coerce.number().int().min(1).nullable().optional(),
  is_active: z.boolean().default(true),
  is_global: z.boolean().default(true),
  items: z.array(modifierItemSchema).default([]),
})

type ModifierGroupFormValues = z.infer<typeof modifierGroupFormSchema>

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
      items: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  })

  const { isSubmitting } = form.formState

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
          items: (groupDetails?.items || []).map(item => ({
            ...item,
            description: item.description || '',
            _isNew: false,
            _isDeleted: false,
          })),
        })
      } else {
        form.reset({
          name: '',
          description: '',
          is_required: false,
          min_selections: 0,
          max_selections: null,
          is_active: true,
          is_global: !isLocationView,
          items: [],
        })
      }
    }
  }, [open, isEdit, group, groupDetails, form, isLocationView])

  const addOption = () => {
    append({
      name: '',
      description: '',
      price_modifier: 0,
      is_default: false,
      is_active: true,
      display_order: fields.length,
      _isNew: true,
      _isDeleted: false,
    })
  }

  const removeOption = (index: number) => {
    const item = fields[index]
    if ((item as any)._isNew) {
      // New items that haven't been saved - just remove from form
      remove(index)
    } else {
      // Existing items - mark as deleted
      form.setValue(`items.${index}._isDeleted` as any, true)
    }
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

      // Handle modifier items
      for (let i = 0; i < values.items.length; i++) {
        const item = values.items[i]

        if ((item as any)._isDeleted && item.id) {
          // Delete existing item
          await deleteAdminModifierItem(merchantId, item.id)
        } else if ((item as any)._isNew || !item.id) {
          // Create new item
          await createAdminModifierItem(merchantId, groupId, {
            name: item.name,
            description: item.description || null,
            price_modifier: item.price_modifier,
            is_default: item.is_default,
            is_active: item.is_active,
            display_order: item.display_order,
          })
        } else if (item.id) {
          // Update existing item
          await updateAdminModifierItem(merchantId, item.id, {
            name: item.name,
            description: item.description || null,
            price_modifier: item.price_modifier,
            is_default: item.is_default,
            is_active: item.is_active,
            display_order: item.display_order,
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

  const visibleItems = fields.filter((_, index) => {
    const item = form.getValues(`items.${index}`)
    return !(item as any)._isDeleted
  })

  return (
    <BottomSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <BottomSheetContent height="auto">
        <BottomSheetHeader>
          <BottomSheetTitle>
            {isEdit ? 'Edit Modifier Group' : 'Create Modifier Group'}
          </BottomSheetTitle>
          <BottomSheetDescription>
            {isEdit
              ? 'Update the modifier group and its options below.'
              : 'Create a new modifier group with customization options.'}
          </BottomSheetDescription>
        </BottomSheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <BottomSheetBody className="space-y-6">
              {/* Basic Info Section */}
              <BottomSheetSection title="Basic Information">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Size, Toppings, Add-ons"
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
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </BottomSheetSection>

              {/* Selection Rules */}
              <BottomSheetSection title="Selection Rules">
                <FormField
                  control={form.control}
                  name="is_required"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Required</FormLabel>
                        <FormDescription>
                          Customer must select an option
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
              </BottomSheetSection>

              {/* Modifier Options */}
              <BottomSheetSection
                title="Modifier Options"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOption}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Option
                  </Button>
                }
              >
                {visibleItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No options added yet. Click "Add Option" to create modifier choices.
                    </p>
                  </div>
                ) : (
                  <Accordion type="single" collapsible className="w-full space-y-2">
                    {fields.map((field, index) => {
                      const item = form.getValues(`items.${index}`)
                      if ((item as any)._isDeleted) return null

                      return (
                        <AccordionItem key={field.id} value={`item-${index}`} className="border rounded-lg">
                          <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-medium">
                                {form.watch(`items.${index}.name`) || `Option ${index + 1}`}
                              </span>
                              {form.watch(`items.${index}.price_modifier`) !== 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {form.watch(`items.${index}.price_modifier`) > 0 ? '+' : ''}
                                  ${form.watch(`items.${index}.price_modifier`).toFixed(2)}
                                </Badge>
                              )}
                              {form.watch(`items.${index}.is_default`) && (
                                <Badge variant="outline" className="text-xs">Default</Badge>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4 space-y-4">
                            <FormField
                              control={form.control}
                              name={`items.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Option Name *</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="e.g., Small, Medium, Large"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`items.${index}.description`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Optional description"
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
                              name={`items.${index}.price_modifier`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Price Modifier</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                      <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="pl-9"
                                        {...field}
                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormDescription>
                                    Amount to add/subtract from price (use negative for discounts)
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="flex gap-4">
                              <FormField
                                control={form.control}
                                name={`items.${index}.is_default`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center justify-between rounded-lg border p-3 flex-1">
                                    <div className="space-y-0.5">
                                      <FormLabel className="text-sm">Default</FormLabel>
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

                              <FormField
                                control={form.control}
                                name={`items.${index}.is_active`}
                                render={({ field }) => (
                                  <FormItem className="flex items-center justify-between rounded-lg border p-3 flex-1">
                                    <div className="space-y-0.5">
                                      <FormLabel className="text-sm">Active</FormLabel>
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
                            </div>

                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeOption(index)}
                              className="w-full"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Option
                            </Button>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                )}
              </BottomSheetSection>

              {/* Settings */}
              <BottomSheetSection title="Settings">
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

                {/* Show current scope in edit mode */}
                {isEdit && group && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">Scope</p>
                        <p className="text-sm text-muted-foreground">
                          {group.is_global
                            ? 'Available across all locations'
                            : 'Location-specific'}
                        </p>
                      </div>
                      <Badge variant="outline" className={group.is_global ? 'bg-slate-50' : 'bg-blue-50 text-blue-700'}>
                        {group.is_global ? (
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
                )}
              </BottomSheetSection>
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
                {isEdit ? 'Save Changes' : 'Create Modifier Group'}
              </Button>
            </BottomSheetFooter>
          </form>
        </Form>
      </BottomSheetContent>
    </BottomSheet>
  )
}
