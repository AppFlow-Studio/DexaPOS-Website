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
    Tag,
    ChevronDown,
    ChevronRight,
    Image as ImageIcon,
    Calendar,
    Sparkles,
    Palette,
    Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreateCategory, UpdateCategory } from '@/app/dashboard/actions/categories'
import { MenusModel, SchedulesModel } from '@/types/db-modles'

// Form schema
const categorySchema = z.object({
    name: z.string().min(2, 'Category name must be at least 2 characters').max(100, 'Category name must be less than 100 characters'),
    description: z.string().max(500, 'Description must be less than 500 characters').optional(),
    image_url: z.string().url().optional().nullable(),
    display_order: z.number().min(0).optional().nullable(),
    is_active: z.boolean().default(true),
})

type CategoryFormValues = z.infer<typeof categorySchema>

interface CategoryFormSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    clerkOrgId: string | undefined
    menus?: MenusModel[]
    schedules?: SchedulesModel[]
    onSuccess?: () => void
    editCategory?: any
}

export function CategoryFormSheet({
    open,
    onOpenChange,
    clerkOrgId,
    menus = [],
    schedules = [],
    onSuccess,
    editCategory,
}: CategoryFormSheetProps) {
    const queryClient = useQueryClient()
    const [selectedMenu, setSelectedMenu] = React.useState<string | null>(null)
    const [selectedSchedules, setSelectedSchedules] = React.useState<string[]>([])
    const [expandedSections, setExpandedSections] = React.useState({
        appearance: false,
        scheduling: false,
        advanced: false,
    })
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    const form = useForm<CategoryFormValues>({
        resolver: zodResolver(categorySchema),
        defaultValues: {
            name: '',
            description: '',
            image_url: '',
            display_order: null,
            is_active: true,
        },
    })

    // Reset form when editCategory changes
    React.useEffect(() => {
        if (editCategory) {
            form.reset({
                name: editCategory.name || '',
                description: editCategory.description || '',
                image_url: editCategory.image_url || '',
                display_order: editCategory.display_order || null,
                is_active: editCategory.is_active ?? true,
            })
            // Set selected menu from editCategory
            if (editCategory.menu_id) {
                setSelectedMenu(editCategory.menu_id)
            } else {
                setSelectedMenu(null)
            }
            // Set selected schedules from editCategory
            if (editCategory.category_schedules) {
                setSelectedSchedules(editCategory.category_schedules.map((s: any) => s.schedule_id || s.schedule?.id).filter(Boolean))
            }
        } else {
            form.reset({
                name: '',
                description: '',
                image_url: '',
                display_order: null,
                is_active: true,
            })
            setSelectedMenu(null)
            setSelectedSchedules([])
        }
    }, [editCategory, form])

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
    }

    const toggleSchedule = (scheduleId: string) => {
        setSelectedSchedules(prev =>
            prev.includes(scheduleId)
                ? prev.filter(id => id !== scheduleId)
                : [...prev, scheduleId]
        )
    }

    const onSubmit = async (values: CategoryFormValues) => {
        if (!clerkOrgId) {
            toast.error('Organization Not Found', {
                description: 'Please ensure you are logged into an organization.'
            })
            return
        }

        setIsSubmitting(true)
        try {
            let result

            if (editCategory) {
                // Update existing category
                result = await UpdateCategory(editCategory.id, {
                    name: values.name,
                    description: values.description,
                    image_url: values.image_url ?? undefined,
                    display_order: values.display_order ?? undefined,
                    is_active: values.is_active,
                })
            } else {
                // Create new category
                result = await CreateCategory(clerkOrgId, {
                    name: values.name,
                    description: values.description,
                    image_url: values.image_url ?? undefined,
                    display_order: values.display_order ?? undefined,
                    is_active: values.is_active,
                    menu_id: selectedMenu || undefined,
                })
            }

            if (result.error) {
                toast.error('Operation Failed', {
                    description: result.error
                })
                return
            }

            toast.success(editCategory ? 'Category Updated' : 'Category Created', {
                description: editCategory
                    ? `"${values.name}" has been updated successfully.`
                    : `"${values.name}" has been added to your menu.`
            })
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            form.reset()
            setSelectedMenu(null)
            setSelectedSchedules([])
            onOpenChange(false)
            onSuccess?.()
        } catch (error) {
            toast.error(editCategory ? 'Update Failed' : 'Creation Failed', {
                description: editCategory
                    ? 'Unable to update the category. Please try again.'
                    : 'Unable to create the category. Please try again.'
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleClose = () => {
        form.reset()
        setSelectedMenu(null)
        setSelectedSchedules([])
        onOpenChange(false)
    }

    const watchedValues = form.watch()

    return (
        <BottomSheet open={open} onOpenChange={handleClose}>
            <BottomSheetContent className="!h-[95vh]">
                <BottomSheetHeader>
                    <BottomSheetTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5 text-primary" />
                        {editCategory ? 'Edit Category' : 'Create New Category'}
                    </BottomSheetTitle>
                    <BottomSheetDescription>
                        Categories help organize your menu items for easy navigation.
                    </BottomSheetDescription>
                </BottomSheetHeader>

                <BottomSheetBody>
                    <div className="flex flex-col lg:flex-row h-full gap-6">
                        {/* Form Section */}
                        <div className="flex-1 overflow-y-auto space-y-4">
                            <Form {...form}>
                                <form id="category-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    {/* Basic Info Section */}
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
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
                                                            placeholder="e.g., Appetizers, Main Course, Desserts"
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
                                                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                                                            placeholder="Optional description for this category..."
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* Menu Assignment */}
                                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300" style={{ animationDelay: '100ms' }}>
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                            Menu Assignment
                                        </h3>
                                        <p className="text-sm text-muted-foreground">
                                            Leave empty to make this category available across all menus (merchant global).
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMenu(null)}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                                    "border hover:scale-105 active:scale-95",
                                                    selectedMenu === null
                                                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                                                        : "bg-background border-border hover:border-primary/50"
                                                )}
                                            >
                                                <Sparkles className="h-4 w-4 inline-block mr-2" />
                                                Global (All Menus)
                                            </button>
                                            {menus.map((menu) => (
                                                <button
                                                    key={menu.id}
                                                    type="button"
                                                    onClick={() => setSelectedMenu(menu.id)}
                                                    className={cn(
                                                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                                        "border hover:scale-105 active:scale-95",
                                                        selectedMenu === menu.id
                                                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                                                            : "bg-background border-border hover:border-primary/50"
                                                    )}
                                                >
                                                    {menu.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Appearance Section */}
                                    <Collapsible open={expandedSections.appearance} onOpenChange={() => toggleSection('appearance')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
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
                                        <CollapsibleContent className="pt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <FormField
                                                control={form.control}
                                                name="image_url"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Category Image URL</FormLabel>
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
                                                        <FormDescription>Optional image to represent this category</FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </CollapsibleContent>
                                    </Collapsible>

                                    {/* Scheduling Section */}
                                    <Collapsible open={expandedSections.scheduling} onOpenChange={() => toggleSection('scheduling')}>
                                        <CollapsibleTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                            >
                                                <span className="text-sm font-semibold flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-blue-500" />
                                                    Availability Schedule
                                                    {selectedSchedules.length > 0 && (
                                                        <Badge variant="secondary" className="ml-2">{selectedSchedules.length}</Badge>
                                                    )}
                                                </span>
                                                {expandedSections.scheduling ? (
                                                    <ChevronDown className="h-4 w-4 transition-transform duration-200" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 transition-transform duration-200" />
                                                )}
                                            </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="pt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {schedules.length === 0 ? (
                                                <div className="text-center py-4 text-muted-foreground text-sm">
                                                    No schedules available. Create schedules first to control when this category is available.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {schedules.map((schedule) => (
                                                        <button
                                                            key={schedule.id}
                                                            type="button"
                                                            onClick={() => toggleSchedule(schedule.id)}
                                                            className={cn(
                                                                "w-full p-3 rounded-lg border text-left transition-all duration-200",
                                                                "hover:shadow-md",
                                                                selectedSchedules.includes(schedule.id)
                                                                    ? "border-primary bg-primary/5 shadow-sm"
                                                                    : "border-border hover:border-primary/50"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <div className="font-medium">{schedule.name}</div>
                                                                    {schedule.description && (
                                                                        <div className="text-sm text-muted-foreground mt-1">
                                                                            {schedule.description}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className={cn(
                                                                    "w-5 h-5 rounded-full border-2 transition-all duration-200 flex items-center justify-center",
                                                                    selectedSchedules.includes(schedule.id)
                                                                        ? "border-primary bg-primary"
                                                                        : "border-muted-foreground"
                                                                )}>
                                                                    {selectedSchedules.includes(schedule.id) && (
                                                                        <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
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
                                                name="display_order"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Display Order</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                placeholder="Auto"
                                                                {...field}
                                                                value={field.value ?? ''}
                                                                onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            Lower numbers appear first. Leave empty for automatic ordering.
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
                                                                Inactive categories won't appear in the POS
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
                                        </CollapsibleContent>
                                    </Collapsible>
                                </form>
                            </Form>
                        </div>

                        {/* Preview Section */}
                        <div className="w-full lg:w-1/3 bg-muted/30 rounded-lg p-6 flex flex-col">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Sparkles className="h-4 w-4" />
                                Preview
                            </h3>

                            {/* Category Preview Card */}
                            <div className="bg-card rounded-xl border-2 border-border/50 p-4 shadow-lg transition-all duration-300 hover:shadow-xl">
                                {watchedValues.image_url ? (
                                    <div className="aspect-video rounded-lg bg-muted mb-3 overflow-hidden">
                                        <img
                                            src={watchedValues.image_url}
                                            alt="Category preview"
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none'
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="aspect-video rounded-lg bg-muted/50 mb-3 flex items-center justify-center">
                                        <Tag className="h-12 w-12 text-muted-foreground/30" />
                                    </div>
                                )}

                                <h4 className={cn(
                                    "text-lg font-semibold transition-colors duration-200",
                                    watchedValues.name ? "text-foreground" : "text-muted-foreground/50"
                                )}>
                                    {watchedValues.name || 'Category Name'}
                                </h4>

                                {watchedValues.description && (
                                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                        {watchedValues.description}
                                    </p>
                                )}

                                <div className="flex items-center gap-2 mt-3">
                                    <Badge variant={watchedValues.is_active ? "default" : "secondary"}>
                                        {watchedValues.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                    <Badge variant="outline">
                                        {selectedMenu ? menus.find(m => m.id === selectedMenu)?.name || 'Menu' : 'Global'}
                                    </Badge>
                                </div>
                            </div>

                            {/* Info Summary */}
                            <div className="mt-6 space-y-2 text-sm">
                                {selectedSchedules.length > 0 && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Calendar className="h-4 w-4 text-blue-500" />
                                        {selectedSchedules.length} schedule{selectedSchedules.length !== 1 ? 's' : ''} assigned
                                    </div>
                                )}
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
                        form="category-form"
                        disabled={isSubmitting}
                        className="flex-1 lg:flex-none lg:min-w-[150px]"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                {editCategory ? 'Saving...' : 'Creating...'}
                            </>
                        ) : editCategory ? 'Save Changes' : 'Create Category'}
                    </Button>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}

