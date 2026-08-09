'use client'

import { useState, useEffect } from 'react'
import {
    BottomSheet,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetTitle,
    BottomSheetBody,
    BottomSheetFooter,
} from '@/components/ui/bottom-sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { CategoryPicker, CategoryOption } from './category-picker'
import { MenuItemPicker, MenuItemOption } from './menu-item-picker'
import { DiscountFormInput } from '@/types/discount'
import { cn } from '@/lib/utils'

interface TargetingSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    categories: CategoryOption[]
    menuItems: MenuItemOption[]
    values: Partial<Pick<
        DiscountFormInput,
        | 'scope'
        | 'applies_to_categories'
        | 'exclude_categories'
        | 'exclude_alcohol'
        | 'menu_item_ids'
    >>
    onChange: (values: Partial<Pick<
        DiscountFormInput,
        | 'scope'
        | 'applies_to_categories'
        | 'exclude_categories'
        | 'exclude_alcohol'
        | 'menu_item_ids'
    >>) => void
}

/** DS-CTL-05 — one tab pill on the segmented rail. */
const TAB_PILL =
    'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border'

/** A brand-blue section heading inside the sheet. */
const SECTION_HEADING =
    'text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]'

const SCOPE_OPTIONS = [
    { value: 'dine_in', label: 'Dine-in only', hint: 'Only on orders eaten in the restaurant' },
    { value: 'takeout', label: 'Takeout only', hint: 'Only on orders taken away' },
    { value: 'both', label: 'Both dine-in and takeout', hint: 'Available on every order type' },
] as const

export function TargetingSheet({
    open,
    onOpenChange,
    categories,
    menuItems,
    values,
    onChange,
}: TargetingSheetProps) {
    const [localValues, setLocalValues] = useState(values)

    // Sync local values when prop values change
    useEffect(() => {
        setLocalValues(values)
    }, [values])

    const handleChange = (updates: Partial<typeof localValues>) => {
        const newValues = { ...localValues, ...updates }
        setLocalValues(newValues)
    }

    const handleSave = () => {
        onChange(localValues)
        onOpenChange(false)
    }

    const handleCancel = () => {
        setLocalValues(values) // Reset to original values
        onOpenChange(false)
    }

    return (
        <BottomSheet open={open} onOpenChange={onOpenChange}>
            <BottomSheetContent height="95" className="flex flex-col">
                {/* `border-0` overrides the shared primitive's divider rules —
                    scoped here so other bottom sheets keep theirs. */}
                <BottomSheetHeader className="border-0">
                    <BottomSheetTitle className="text-[1.75rem] font-semibold tracking-[-0.02em]">
                        Configure targeting
                    </BottomSheetTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Set which items, categories, and order types this discount applies to.
                    </p>
                </BottomSheetHeader>

                <BottomSheetBody className="flex-1 overflow-y-auto">
                    <Tabs defaultValue="categories" className="w-full">
                        <div className="w-full min-w-0 overflow-x-auto pb-1">
                            <TabsList className="inline-flex h-auto w-max flex-nowrap gap-0.5 rounded-full bg-muted/70 p-1">
                                <TabsTrigger value="categories" className={TAB_PILL}>
                                    Categories
                                </TabsTrigger>
                                <TabsTrigger value="items" className={TAB_PILL}>
                                    Menu items
                                </TabsTrigger>
                                <TabsTrigger value="exclusions" className={TAB_PILL}>
                                    Exclusions
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Categories Tab */}
                        <TabsContent value="categories" className="mt-6 space-y-8">
                            <section className="min-w-0">
                                <h3 className={SECTION_HEADING}>Order scope</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Choose which order types this discount applies to.
                                </p>
                                <RadioGroup
                                    value={localValues.scope || 'both'}
                                    onValueChange={(value) =>
                                        handleChange({ scope: value as 'dine_in' | 'takeout' | 'both' })
                                    }
                                    className="mt-4 gap-0 rounded-2xl border-0 bg-muted/60 p-1 shadow-none"
                                >
                                    {SCOPE_OPTIONS.map(({ value, label, hint }) => (
                                        <Label
                                            key={value}
                                            htmlFor={`scope-${value}`}
                                            className={cn(
                                                'flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3',
                                                'transition-colors hover:bg-background/60',
                                            )}
                                        >
                                            <RadioGroupItem
                                                value={value}
                                                id={`scope-${value}`}
                                                className="mt-0.5"
                                            />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium">{label}</span>
                                                <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
                                                    {hint}
                                                </span>
                                            </span>
                                        </Label>
                                    ))}
                                </RadioGroup>
                            </section>

                            <section className="min-w-0">
                                <h3 className={SECTION_HEADING}>Include categories</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Select categories to include. Leave empty to apply to all categories.
                                </p>
                                <div className="mt-4">
                                    <CategoryPicker
                                        options={categories}
                                        value={localValues.applies_to_categories || []}
                                        onChange={(value) => handleChange({ applies_to_categories: value })}
                                        placeholder="Select categories to include"
                                        emptyLabel="No categories available"
                                    />
                                </div>
                            </section>
                        </TabsContent>

                        {/* Menu Items Tab */}
                        <TabsContent value="items" className="mt-6">
                            <section className="min-w-0">
                                <h3 className={SECTION_HEADING}>Item-specific targeting</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Select specific menu items this discount applies to. Leave empty to
                                    apply to all items.
                                </p>
                                <div className="mt-4">
                                    <MenuItemPicker
                                        options={menuItems}
                                        value={localValues.menu_item_ids || []}
                                        onChange={(value) => handleChange({ menu_item_ids: value })}
                                        placeholder="Select menu items"
                                        emptyLabel="No menu items available"
                                    />
                                </div>
                            </section>
                        </TabsContent>

                        {/* Exclusions Tab */}
                        <TabsContent value="exclusions" className="mt-6 space-y-8">
                            <section className="min-w-0">
                                <h3 className={SECTION_HEADING}>Exclude categories</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Select categories to exclude from this discount.
                                </p>
                                <div className="mt-4">
                                    <CategoryPicker
                                        options={categories}
                                        value={localValues.exclude_categories || []}
                                        onChange={(value) => handleChange({ exclude_categories: value })}
                                        placeholder="Select categories to exclude"
                                        emptyLabel="No categories available"
                                    />
                                </div>
                            </section>

                            <section className="min-w-0">
                                <h3 className={SECTION_HEADING}>Exclude alcohol</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Automatically exclude items flagged as alcohol from this discount.
                                </p>
                                <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border-0 bg-muted/60 px-4 py-4 shadow-none">
                                    <div className="min-w-0">
                                        <Label htmlFor="exclude-alcohol" className="text-sm font-medium">
                                            Exclude alcohol items
                                        </Label>
                                        <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                                            Skip items with the alcohol tax category.
                                        </p>
                                    </div>
                                    <Switch
                                        id="exclude-alcohol"
                                        checked={localValues.exclude_alcohol || false}
                                        onCheckedChange={(checked) =>
                                            handleChange({ exclude_alcohol: checked })
                                        }
                                    />
                                </div>
                            </section>
                        </TabsContent>
                    </Tabs>
                </BottomSheetBody>

                <BottomSheetFooter className="flex gap-3 border-0">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        className="h-9 flex-1 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="h-9 flex-1 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                    >
                        Save targeting
                    </Button>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}
