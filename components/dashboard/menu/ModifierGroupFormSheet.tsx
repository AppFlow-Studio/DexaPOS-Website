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
import {
    Layers,
    Plus,
    X,
    ChevronDown,
    ChevronRight,
    GripVertical,
    Settings2,
    DollarSign,
    Trash2,
    Edit3,
    Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    CreateModifierGroup,
    UpdateModifierGroup,
    CreateModifierGroupItem,
    UpdateModifierGroupItem,
    DeleteModifierGroupItem
} from '@/app/dashboard/actions/modifier-groups'
import { ModifierGroupsModel, ModifierGroupItemsModel } from '@/types/db-modles'
import { useIsAllLocations, useSelectedLocation } from '@/app/dashboard/hooks/useLocationScopedModifiers'
import { ModifierItemOverrideDialog } from './ModifierItemOverrideDialog'
import { useUserInfo } from '@/app/manage/hooks/useUserInfo.'

// Form schema for modifier group
const modifierGroupSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
    description: z.string().max(500, 'Description must be less than 500 characters').optional(),
    is_required: z.boolean().default(false),
    min_selections: z.number().min(0).default(0),
    max_selections: z.number().min(0).optional().nullable(),
    display_order: z.number().min(0).optional().nullable(),
})

type ModifierGroupFormValues = z.infer<typeof modifierGroupSchema>

// Schema for option form (nested)
const optionSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
    description: z.string().max(500).optional(),
    price_modifier: z.number().default(0),
    display_order: z.number().min(0).optional().nullable(),
    is_active: z.boolean().default(true),
})

type OptionFormValues = z.infer<typeof optionSchema>

interface TempOption {
    id: string
    name: string
    description?: string
    price_modifier: number
    display_order?: number
    is_active: boolean
    isNew: boolean
}

interface ModifierGroupFormSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    clerkOrgId: string | undefined
    onSuccess?: () => void
    editGroup?: ModifierGroupsModel & { modifier_group_items?: ModifierGroupItemsModel[] }
}

export function ModifierGroupFormSheet({
    open,
    onOpenChange,
    clerkOrgId,
    onSuccess,
    editGroup,
}: ModifierGroupFormSheetProps) {
    const queryClient = useQueryClient()
    const { data: userInfo } = useUserInfo()
    const merchantId = userInfo?.members?.[0]?.organizations?.merchants?.id || ''
    const [options, setOptions] = React.useState<TempOption[]>([])
    const [isAddOptionSheetOpen, setIsAddOptionSheetOpen] = React.useState(false)
    const [editingOption, setEditingOption] = React.useState<TempOption | null>(null)
    const [expandedSections, setExpandedSections] = React.useState({
        selection: true,
        advanced: false,
    })
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [overrideDialogOpen, setOverrideDialogOpen] = React.useState(false)
    const [selectedItemForOverride, setSelectedItemForOverride] = React.useState<TempOption | null>(null)

    // Location context
    const isAllLocations = useIsAllLocations()
    const selectedLocation = useSelectedLocation()

    // Determine editing permissions
    const isGlobalGroup = editGroup && !editGroup.location_id
    const isLocationView = !isAllLocations
    const canEditStructure = !isGlobalGroup || !isLocationView

    const form = useForm<ModifierGroupFormValues>({
        resolver: zodResolver(modifierGroupSchema),
        defaultValues: {
            name: '',
            description: '',
            is_required: false,
            min_selections: 0,
            max_selections: null,
            display_order: null,
        },
    })

    const optionForm = useForm<OptionFormValues>({
        resolver: zodResolver(optionSchema),
        defaultValues: {
            name: '',
            description: '',
            price_modifier: 0,
            display_order: null,
            is_active: true,
        },
    })

    // Reset form and options when editGroup changes
    React.useEffect(() => {
        if (editGroup) {
            form.reset({
                name: editGroup.name || '',
                description: editGroup.description || '',
                is_required: editGroup.is_required ?? false,
                min_selections: editGroup.min_selections ?? 0,
                max_selections: editGroup.max_selections ?? null,
                display_order: editGroup.display_order ?? null,
            })
            // Initialize options from editGroup
            if (editGroup.modifier_group_items) {
                setOptions(editGroup.modifier_group_items.map(item => ({
                    id: item.id,
                    name: item.name,
                    description: item.description || undefined,
                    price_modifier: item.price_modifier,
                    display_order: item.display_order ?? undefined,
                    is_active: item.is_active ?? true,
                    isNew: false,
                })))
            }
        } else {
            form.reset({
                name: '',
                description: '',
                is_required: false,
                min_selections: 0,
                max_selections: null,
                display_order: null,
            })
            setOptions([])
        }
    }, [editGroup, form])

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
    }

    const handleAddOption = (values: OptionFormValues) => {
        if (editingOption) {
            setOptions(prev => prev.map(opt =>
                opt.id === editingOption.id
                    ? { ...opt, ...values }
                    : opt
            ))
            setEditingOption(null)
        } else {
            const newOption: TempOption = {
                id: `temp-${Date.now()}`,
                name: values.name,
                description: values.description,
                price_modifier: values.price_modifier,
                display_order: values.display_order ?? options.length,
                is_active: values.is_active,
                isNew: true,
            }
            setOptions(prev => [...prev, newOption])
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
            display_order: option.display_order ?? null,
            is_active: option.is_active,
        })
        setIsAddOptionSheetOpen(true)
    }

    const handleDeleteOption = (optionId: string) => {
        setOptions(prev => prev.filter(opt => opt.id !== optionId))
    }

    const onSubmit = async (values: ModifierGroupFormValues) => {
        if (!clerkOrgId) {
            toast.error('Organization Not Found', {
                description: 'Please ensure you are logged into an organization.'
            })
            return
        }

        setIsSubmitting(true)
        try {
            if (editGroup) {
                // Update existing group (only if allowed to edit structure)
                if (canEditStructure) {
                    const updateResult = await UpdateModifierGroup(editGroup.id, {
                        name: values.name,
                        description: values.description,
                        is_required: values.is_required,
                        min_selections: values.min_selections,
                        max_selections: values.max_selections,
                        display_order: values.display_order ?? undefined,
                    })

                    if (updateResult.error) {
                        toast.error('Update Failed', {
                            description: updateResult.error
                        })
                        return
                    }

                    // Handle options updates (only if allowed)
                    for (const option of options) {
                        if (option.isNew) {
                            // Create new option
                            await CreateModifierGroupItem(editGroup.id, {
                                name: option.name,
                                description: option.description,
                                price_modifier: option.price_modifier,
                                display_order: option.display_order,
                                is_active: option.is_active,
                                merchant_id: merchantId,
                            })
                        } else {
                            // Update existing option
                            await UpdateModifierGroupItem(option.id, {
                                name: option.name,
                                description: option.description,
                                price_modifier: option.price_modifier,
                                display_order: option.display_order,
                                is_active: option.is_active,
                            })
                        }
                    }

                    // Delete removed options
                    const currentOptionIds = options.filter(o => !o.isNew).map(o => o.id)
                    const originalOptionIds = editGroup.modifier_group_items?.map(o => o.id) || []
                    const deletedOptionIds = originalOptionIds.filter(id => !currentOptionIds.includes(id))

                    for (const id of deletedOptionIds) {
                        await DeleteModifierGroupItem(id)
                    }

                    toast.success('Modifier Group Updated', {
                        description: `"${values.name}" has been updated with ${options.length} option${options.length !== 1 ? 's' : ''}.`
                    })
                } else {
                    // At location level viewing global group - overrides are handled via ModifierItemOverrideDialog
                    toast.info('Location View', {
                        description: 'Use "Edit State" buttons to customize options at this location.'
                    })
                }
            } else {
                // Create new group with options
                const result = await CreateModifierGroup(clerkOrgId, {
                    name: values.name,
                    description: values.description,
                    is_required: values.is_required,
                    min_selections: values.min_selections,
                    max_selections: values.max_selections ?? undefined,
                    display_order: values.display_order ?? undefined,
                    location_id: selectedLocation?.id == 'all' ? null : selectedLocation?.id,
                    options: options.map((opt, index) => ({
                        name: opt.name,
                        description: opt.description,
                        price_modifier: opt.price_modifier,
                        display_order: opt.display_order ?? index,
                        merchant_id: merchantId,
                    })),
                })

                if (result.error) {
                    toast.error('Creation Failed', {
                        description: result.error
                    })
                    return
                }

                toast.success('Modifier Group Created', {
                    description: `"${values.name}" has been created with ${options.length} option${options.length !== 1 ? 's' : ''}.`
                })
            }

            queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
            form.reset()
            setOptions([])
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error('Save Failed', {
                description: 'Unable to save the modifier group. Please try again.'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClose = () => {
        form.reset()
        setOptions([])
        setEditingOption(null)
        onOpenChange(false)
    }

    const watchedValues = form.watch()

    return (
        <>
            <BottomSheet open={open} onOpenChange={handleClose}>
                <BottomSheetContent className="!h-[95vh]">
                    <BottomSheetHeader>
                        <BottomSheetTitle className="flex items-center gap-2">
                            <Layers className="h-5 w-5 text-purple-500" />
                            {!canEditStructure ? (
                                <>Customize Global Group at Location</>
                            ) : editGroup ? (
                                'Edit Modifier Group'
                            ) : (
                                'Create Modifier Group'
                            )}
                        </BottomSheetTitle>
                        <BottomSheetDescription>
                            {!canEditStructure ? (
                                <>Customize pricing, visibility, ordering, and stock for options at <Badge variant="secondary" className="ml-1">{selectedLocation?.name}</Badge></>
                            ) : (
                                'Modifier groups let customers customize their orders (e.g., size, toppings, sauces).'
                            )}
                        </BottomSheetDescription>
                    </BottomSheetHeader>

                    <BottomSheetBody>
                        <div className="flex flex-col lg:flex-row h-full gap-6">
                            {/* Form Section */}
                            <div className="flex-1 overflow-y-auto space-y-4">
                                <Form {...form}>
                                    <form id="modifier-group-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                        {/* Basic Info */}
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                                <Layers className="h-4 w-4" />
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
                                                                placeholder="e.g., Size, Toppings, Sauce"
                                                                className="h-12 text-lg"
                                                                disabled={!canEditStructure}
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        {!canEditStructure && (
                                                            <FormDescription className="text-xs text-muted-foreground">
                                                                Global group settings cannot be edited at location level
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
                                                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                                                placeholder="Optional description for this modifier group..."
                                                                disabled={!canEditStructure}
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </div>

                                        {/* Selection Rules */}
                                        <Collapsible open={expandedSections.selection} onOpenChange={() => toggleSection('selection')}>
                                            <CollapsibleTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                                >
                                                    <span className="text-sm font-semibold flex items-center gap-2">
                                                        <Settings2 className="h-4 w-4 text-blue-500" />
                                                        Selection Rules
                                                    </span>
                                                    {expandedSections.selection ? (
                                                        <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                    )}
                                                </button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <FormField
                                                    control={form.control}
                                                    name="is_required"
                                                    render={({ field }) => (
                                                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                                            <div className="space-y-0.5">
                                                                <FormLabel className="text-base">Required</FormLabel>
                                                                <FormDescription>
                                                                    Customer must select an option from this group
                                                                </FormDescription>
                                                            </div>
                                                            <FormControl>
                                                                <button
                                                                    type="button"
                                                                    role="switch"
                                                                    aria-checked={field.value}
                                                                    onClick={() => canEditStructure && field.onChange(!field.value)}
                                                                    disabled={!canEditStructure}
                                                                    className={cn(
                                                                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                                                        field.value ? "bg-primary" : "bg-muted",
                                                                        !canEditStructure && "opacity-50 cursor-not-allowed"
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
                                                                        min="0"
                                                                        disabled={!canEditStructure}
                                                                        {...field}
                                                                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                                                    />
                                                                </FormControl>
                                                                <FormDescription>0 = no minimum</FormDescription>
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
                                                                        min="0"
                                                                        placeholder="Unlimited"
                                                                        disabled={!canEditStructure}
                                                                        {...field}
                                                                        value={field.value ?? ''}
                                                                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                                                    />
                                                                </FormControl>
                                                                <FormDescription>Empty = unlimited</FormDescription>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>

                                        {/* Options Section */}
                                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '200ms' }}>
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                                    <DollarSign className="h-4 w-4 text-green-500" />
                                                    Options ({options.length})
                                                </h3>
                                                {canEditStructure && (
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
                                                        <Plus className="h-4 w-4 mr-1" />
                                                        Add Option
                                                    </Button>
                                                )}
                                            </div>

                                            {!canEditStructure && (
                                                <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
                                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                                        <strong>Location View:</strong> You can customize pricing, visibility, ordering, and stock for this global group's options at this location, but cannot add or remove options.
                                                    </p>
                                                </div>
                                            )}

                                            {options.length === 0 ? (
                                                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                                                    <Layers className="h-12 w-12 mx-auto text-muted-foreground/30 mb-2" />
                                                    <p className="text-muted-foreground text-sm">No options yet</p>
                                                    <p className="text-muted-foreground text-xs mt-1">
                                                        Add options for customers to choose from
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {options.map((option, index) => (
                                                        <div
                                                            key={option.id}
                                                            className={cn(
                                                                "flex items-center gap-3 p-3 rounded-lg border transition-all duration-200",
                                                                "hover:shadow-md group animate-in fade-in slide-in-from-left-4",
                                                                option.is_active ? "bg-card" : "bg-muted/50 opacity-60"
                                                            )}
                                                            style={{ animationDelay: `${index * 50}ms` }}
                                                        >
                                                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />

                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-medium truncate">{option.name}</span>
                                                                    {option.isNew && (
                                                                        <Badge variant="secondary" className="text-xs">New</Badge>
                                                                    )}
                                                                    {!option.is_active && (
                                                                        <Badge variant="outline" className="text-xs">Inactive</Badge>
                                                                    )}
                                                                </div>
                                                                {option.description && (
                                                                    <p className="text-sm text-muted-foreground truncate">{option.description}</p>
                                                                )}
                                                            </div>

                                                            <div className="text-right shrink-0">
                                                                <span className={cn(
                                                                    "font-semibold",
                                                                    option.price_modifier > 0 ? "text-green-600" :
                                                                        option.price_modifier < 0 ? "text-red-500" : "text-muted-foreground"
                                                                )}>
                                                                    {option.price_modifier > 0 ? '+' : ''}${option.price_modifier.toFixed(2)}
                                                                </span>
                                                            </div>

                                                            {canEditStructure ? (
                                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleEditOption(option)}
                                                                    >
                                                                        <Edit3 className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleDeleteOption(option.id)}
                                                                        className="text-destructive hover:text-destructive"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-1">
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setSelectedItemForOverride(option)
                                                                            setOverrideDialogOpen(true)
                                                                        }}
                                                                    >
                                                                        <Settings2 className="h-4 w-4 mr-1" />
                                                                        Edit State
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </form>
                                </Form>
                            </div>

                            {/* Preview Section */}
                            <div className="w-full lg:w-1/3 bg-muted/30 rounded-lg p-6 flex flex-col">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    Preview
                                </h3>

                                {/* Modifier Group Preview Card */}
                                <div className="bg-card rounded-xl border-2 border-border/50 p-4 shadow-lg">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h4 className={cn(
                                                "text-lg font-semibold transition-colors duration-200",
                                                watchedValues.name ? "text-foreground" : "text-muted-foreground/50"
                                            )}>
                                                {watchedValues.name || 'Group Name'}
                                            </h4>
                                            {watchedValues.description && (
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {watchedValues.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-1">
                                            {watchedValues.is_required ? (
                                                <Badge variant="destructive">Required</Badge>
                                            ) : (
                                                <Badge variant="secondary">Optional</Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Selection info */}
                                    <div className="text-xs text-muted-foreground mb-3">
                                        Select {watchedValues.min_selections > 0 ? `${watchedValues.min_selections}` : 'any'}
                                        {watchedValues.max_selections ? ` to ${watchedValues.max_selections}` : watchedValues.min_selections > 0 ? ' or more' : ''}
                                    </div>

                                    {/* Options preview */}
                                    {options.length > 0 && (
                                        <div className="space-y-2 border-t pt-3">
                                            {options.slice(0, 5).map((option) => (
                                                <div
                                                    key={option.id}
                                                    className={cn(
                                                        "flex items-center justify-between py-1",
                                                        !option.is_active && "opacity-50"
                                                    )}
                                                >
                                                    <span className="text-sm">{option.name}</span>
                                                    <span className={cn(
                                                        "text-sm font-medium",
                                                        option.price_modifier > 0 ? "text-green-600" :
                                                            option.price_modifier < 0 ? "text-red-500" : "text-muted-foreground"
                                                    )}>
                                                        {option.price_modifier !== 0 && (
                                                            <>
                                                                {option.price_modifier > 0 ? '+' : ''}${option.price_modifier.toFixed(2)}
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                            {options.length > 5 && (
                                                <p className="text-xs text-muted-foreground text-center pt-2">
                                                    +{options.length - 5} more options
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </BottomSheetBody>

                    <BottomSheetFooter>
                        <Button type="button" variant="outline" onClick={handleClose} className="flex-1 lg:flex-none">
                            {canEditStructure ? 'Cancel' : 'Close'}
                        </Button>
                        {canEditStructure && (
                            <Button
                                type="submit"
                                form="modifier-group-form"
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
                                ) : editGroup ? 'Save Changes' : 'Create Group'}
                            </Button>
                        )}
                    </BottomSheetFooter>
                </BottomSheetContent>
            </BottomSheet>

            {/* Nested Sheet for Adding/Editing Options */}
            <BottomSheet open={isAddOptionSheetOpen} onOpenChange={(open) => {
                if (!open) {
                    setEditingOption(null)
                    optionForm.reset()
                }
                setIsAddOptionSheetOpen(open)
                
            }}>
                <BottomSheetContent height="auto" className="!rounded-t-[24px]">
                    <BottomSheetHeader>
                        <BottomSheetTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-green-500" />
                            {editingOption ? 'Edit Option' : 'Add Option'}
                        </BottomSheetTitle>
                        <BottomSheetDescription>
                            {editingOption ? 'Update this modifier option' : 'Add a new option to this modifier group'}
                        </BottomSheetDescription>
                    </BottomSheetHeader>

                    <BottomSheetBody className=''>
                        <Form {...optionForm}>
                            <form id="option-form" onSubmit={optionForm.handleSubmit(handleAddOption)} className="space-y-4">
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
                                                <Input
                                                    placeholder="Optional description"
                                                    {...field}
                                                />
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
                                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        className="pl-7"
                                                        placeholder="0.00"
                                                        {...field}
                                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                                    />
                                                </div>
                                            </FormControl>
                                            <FormDescription>
                                                Enter 0 for no change, positive for upcharge, negative for discount
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={optionForm.control}
                                    name="is_active"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                            <div className="space-y-0.5">
                                                <FormLabel className="text-base">Active</FormLabel>
                                                <FormDescription>
                                                    Inactive options won't appear in the POS
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
                            </form>
                        </Form>
                    </BottomSheetBody>

                    <BottomSheetFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setIsAddOptionSheetOpen(false)
                                setEditingOption(null)
                                optionForm.reset()
                            }}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="option-form"
                            className="flex-1"
                        >
                            {editingOption ? 'Update Option' : 'Add Option'}
                        </Button>
                    </BottomSheetFooter>
                </BottomSheetContent>
            </BottomSheet>

            {/* Override Dialog for Location-Level Customization */}
            {selectedItemForOverride && selectedLocation && (
                <ModifierItemOverrideDialog
                    open={overrideDialogOpen}
                    onOpenChange={setOverrideDialogOpen}
                    item={{
                        id: selectedItemForOverride.id,
                        name: selectedItemForOverride.name,
                        price_modifier: selectedItemForOverride.price_modifier,
                        display_order: selectedItemForOverride.display_order ?? null,
                        is_active: selectedItemForOverride.is_active,
                    }}
                    locationName={selectedLocation.name}
                />
            )}
        </>
    )
}

