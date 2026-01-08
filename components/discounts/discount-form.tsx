'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { discountFormSchema } from '@/lib/validations/discount'
import { DiscountFormInput, defaultApplicableDays } from '@/types/discount'
import { Button } from '@/components/ui/button'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { DaySelector } from './day-selector'
import { TimeWindowPicker } from './time-window-picker'
import { CategoryOption } from './category-picker'
import { MenuItemOption } from './menu-item-picker'
import { TargetingSheet } from './targeting-sheet'
import { Settings2, X } from 'lucide-react'

interface DiscountFormProps {
    defaultValues?: Partial<DiscountFormInput>
    onSubmit: (values: DiscountFormInput) => Promise<void> | void
    submitting?: boolean
    submitLabel?: string
    categories?: CategoryOption[]
    menuItems?: MenuItemOption[]
    onCancel?: () => void
}

function toDate(value?: Date | string | null) {
    if (!value) return undefined
    return value instanceof Date ? value : new Date(value)
}

export function DiscountForm({
    defaultValues,
    onSubmit,
    submitting,
    submitLabel = 'Save discount',
    categories = [],
    menuItems = [],
    onCancel,
}: DiscountFormProps) {
    const [openSections, setOpenSections] = useState({
        basic: true,
        constraints: true,
        schedule: false,
        approval: true,
    })
    const [targetingSheetOpen, setTargetingSheetOpen] = useState(false)

    const resolvedDefaults: DiscountFormInput = useMemo(
        () => ({
            name: defaultValues?.name ?? '',
            description: defaultValues?.description ?? '',
            discount_type: defaultValues?.discount_type ?? 'percentage',
            discount_value: defaultValues?.discount_value ?? 0,
            min_purchase_amount: defaultValues?.min_purchase_amount,
            max_discount_amount: defaultValues?.max_discount_amount,
            start_date: toDate(defaultValues?.start_date ?? null),
            end_date: toDate(defaultValues?.end_date ?? null),
            is_active: defaultValues?.is_active ?? true,
            scope: defaultValues?.scope ?? 'both',
            requires_manager_approval: defaultValues?.requires_manager_approval ?? false,
            max_uses_per_day: defaultValues?.max_uses_per_day,
            max_uses_per_order: defaultValues?.max_uses_per_order ?? 1,
            applicable_days: defaultValues?.applicable_days ?? defaultApplicableDays,
            applicable_hours_start: defaultValues?.applicable_hours_start,
            applicable_hours_end: defaultValues?.applicable_hours_end,
            exclude_alcohol: defaultValues?.exclude_alcohol ?? false,
            exclude_categories: defaultValues?.exclude_categories ?? [],
            applies_to_categories: defaultValues?.applies_to_categories ?? [],
            stackable: defaultValues?.stackable ?? false,
            display_order: defaultValues?.display_order ?? 0,
            menu_item_ids: defaultValues?.menu_item_ids ?? [],
        }),
        [defaultValues],
    )

    const form = useForm<DiscountFormInput>({
        resolver: zodResolver(discountFormSchema),
        defaultValues: resolvedDefaults,
        mode: 'onBlur',
    })

    const watchType = form.watch('discount_type')

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (form.formState.isDirty) {
                event.preventDefault()
                event.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [form.formState.isDirty])

    const handleSubmit = form.handleSubmit(async (values) => {
        await onSubmit(values)
    })

    const toggleSection = (key: keyof typeof openSections, value: boolean) =>
        setOpenSections((prev) => ({ ...prev, [key]: value }))

    const renderSectionHeader = (title: string, description: string, key: keyof typeof openSections) => (
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                    {openSections[key] ? 'Hide' : 'Show'}
                </Button>
            </CollapsibleTrigger>
        </div>
    )

    return (
        <Form {...form}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Discount details</CardTitle>
                        <CardDescription>Configure how this discount behaves on POS.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Collapsible open={openSections.basic} onOpenChange={(val) => toggleSection('basic', val)}>
                            <div className="mb-3">
                                {renderSectionHeader('Basic info', 'Name, type, and value', 'basic')}
                            </div>
                            <CollapsibleContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Name</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Happy Hour 10%" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="discount_type"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Discount type</FormLabel>
                                                <FormControl>
                                                    <RadioGroup
                                                        onValueChange={field.onChange}
                                                        value={field.value}
                                                        className="flex gap-4"
                                                    >
                                                        <div className="flex items-center space-x-2">
                                                            <RadioGroupItem value="percentage" id="type-percentage" />
                                                            <Label htmlFor="type-percentage">Percentage</Label>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <RadioGroupItem value="fixed" id="type-fixed" />
                                                            <Label htmlFor="type-fixed">Fixed amount</Label>
                                                        </div>
                                                    </RadioGroup>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <FormField
                                        control={form.control}
                                        name="discount_value"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Discount value</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min={0}
                                                        {...field}
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(Number(e.target.value))}
                                                        placeholder={watchType === 'percentage' ? '10' : '5'}
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
                                                    <Textarea placeholder="Optional details for staff" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible
                            open={openSections.constraints}
                            onOpenChange={(val) => toggleSection('constraints', val)}
                        >
                            <div className="mb-3">
                                {renderSectionHeader('Constraints', 'Usage limits and thresholds', 'constraints')}
                            </div>
                            <CollapsibleContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="min_purchase_amount"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Min purchase amount</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min={0}
                                                        value={field.value ?? ''}
                                                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    {watchType === 'percentage' && (
                                        <FormField
                                            control={form.control}
                                            name="max_discount_amount"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Max discount amount</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min={0}
                                                            value={field.value ?? ''}
                                                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    )}
                                    <FormField
                                        control={form.control}
                                        name="max_uses_per_day"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Max uses per day</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={field.value ?? ''}
                                                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div className="grid gap-4 md:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="max_uses_per_order"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Max uses per order</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(Number(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="stackable"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between rounded-md border p-3">
                                                <div>
                                                    <FormLabel>Stackable</FormLabel>
                                                    <CardDescription>Allow combining with other discounts</CardDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        <Collapsible open={openSections.schedule} onOpenChange={(val) => toggleSection('schedule', val)}>
                            <div className="mb-3">
                                {renderSectionHeader('Schedule', 'Date, days, and hours', 'schedule')}
                            </div>
                            <CollapsibleContent className="space-y-4">
                                <div className="space-y-2">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <FormField
                                            control={form.control}
                                            name="start_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Start date</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="end_date"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>End date</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                                            onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    {(form.watch('start_date') || form.watch('end_date')) && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                form.setValue('start_date', undefined)
                                                form.setValue('end_date', undefined)
                                            }}
                                            className="h-7 text-xs text-muted-foreground"
                                        >
                                            <X className="h-3 w-3 mr-1" />
                                            Clear date range
                                        </Button>
                                    )}
                                </div>
                                <FormField
                                    control={form.control}
                                    name="applicable_days"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Applicable days</FormLabel>
                                            <FormControl>
                                                <DaySelector value={field.value} onChange={field.onChange} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="applicable_hours_start"
                                    render={() => (
                                        <FormItem>
                                            <FormLabel>Time window</FormLabel>
                                            <FormControl>
                                                <TimeWindowPicker
                                                    start={form.watch('applicable_hours_start')}
                                                    end={form.watch('applicable_hours_end')}
                                                    onChange={(start, end) => {
                                                        form.setValue('applicable_hours_start', start)
                                                        form.setValue('applicable_hours_end', end)
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </CollapsibleContent>
                        </Collapsible>

                        {/* Targeting Section - Now using Bottom Sheet */}
                        <Card className="border-dashed">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-lg">Targeting</CardTitle>
                                        <CardDescription>Scope, categories, and items</CardDescription>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setTargetingSheetOpen(true)}
                                        className="gap-2"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                        Configure Targeting
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Scope:</span>
                                        <span className="font-medium capitalize">
                                            {form.watch('scope')?.replace('_', ' ') || 'Both'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Include categories:</span>
                                        <span className="font-medium">
                                            {form.watch('applies_to_categories')?.length || 0} selected
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Exclude categories:</span>
                                        <span className="font-medium">
                                            {form.watch('exclude_categories')?.length || 0} selected
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Menu items:</span>
                                        <span className="font-medium">
                                            {form.watch('menu_item_ids')?.length || 0} selected
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Exclude alcohol:</span>
                                        <span className="font-medium">
                                            {form.watch('exclude_alcohol') ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Collapsible
                            open={openSections.approval}
                            onOpenChange={(val) => toggleSection('approval', val)}
                        >
                            <div className="mb-3">
                                {renderSectionHeader('Approval & status', 'Manager approval, ordering, and activation', 'approval')}
                            </div>
                            <CollapsibleContent className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-3">
                                    <FormField
                                        control={form.control}
                                        name="requires_manager_approval"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between rounded-md border p-3">
                                                <div>
                                                    <FormLabel>Requires manager approval</FormLabel>
                                                    <CardDescription>Prompt for manager PIN on POS</CardDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="display_order"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Display order</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        value={field.value}
                                                        onChange={(e) => field.onChange(Number(e.target.value))}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="is_active"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center justify-between rounded-md border p-3">
                                                <div>
                                                    <FormLabel>Active</FormLabel>
                                                    <CardDescription>Control POS availability</CardDescription>
                                                </div>
                                                <FormControl>
                                                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </CardContent>
                </Card>

                <div className="flex items-center justify-end gap-2">
                    {onCancel && (
                        <Button variant="outline" type="button" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" disabled={submitting}>
                        {submitting ? 'Saving...' : submitLabel}
                    </Button>
                </div>
            </form>

            {/* Targeting Bottom Sheet */}
            <TargetingSheet
                open={targetingSheetOpen}
                onOpenChange={setTargetingSheetOpen}
                categories={categories}
                menuItems={menuItems}
                values={{
                    scope: form.watch('scope'),
                    applies_to_categories: form.watch('applies_to_categories'),
                    exclude_categories: form.watch('exclude_categories'),
                    exclude_alcohol: form.watch('exclude_alcohol'),
                    menu_item_ids: form.watch('menu_item_ids'),
                }}
                onChange={(updates) => {
                    Object.entries(updates).forEach(([key, value]) => {
                        form.setValue(key as any, value as any)
                    })
                }}
            />
        </Form>
    )
}

