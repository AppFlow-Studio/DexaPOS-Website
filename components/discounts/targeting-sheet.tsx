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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CategoryPicker, CategoryOption } from './category-picker'
import { MenuItemPicker, MenuItemOption } from './menu-item-picker'
import { DiscountFormInput } from '@/types/discount'

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
                <BottomSheetHeader>
                    <BottomSheetTitle>Configure Targeting</BottomSheetTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                        Set which items, categories, and order types this discount applies to
                    </p>
                </BottomSheetHeader>

                <BottomSheetBody className="flex-1 overflow-y-auto">
                    <Tabs defaultValue="categories" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-6">
                            <TabsTrigger value="categories">Categories</TabsTrigger>
                            <TabsTrigger value="items">Menu Items</TabsTrigger>
                            <TabsTrigger value="exclusions">Exclusions</TabsTrigger>
                        </TabsList>

                        {/* Categories Tab */}
                        <TabsContent value="categories" className="space-y-6 mt-0">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Order Scope</CardTitle>
                                    <CardDescription>
                                        Choose which order types this discount applies to
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <RadioGroup
                                        value={localValues.scope || 'both'}
                                        onValueChange={(value) =>
                                            handleChange({ scope: value as 'dine_in' | 'takeout' | 'both' })
                                        }
                                        className="space-y-3"
                                    >
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="dine_in" id="scope-dine-in" />
                                            <Label htmlFor="scope-dine-in" className="cursor-pointer">
                                                Dine-in only
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="takeout" id="scope-takeout" />
                                            <Label htmlFor="scope-takeout" className="cursor-pointer">
                                                Takeout only
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="both" id="scope-both" />
                                            <Label htmlFor="scope-both" className="cursor-pointer">
                                                Both dine-in and takeout
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Include Categories</CardTitle>
                                    <CardDescription>
                                        Select categories to include. Leave empty to apply to all categories.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <CategoryPicker
                                        options={categories}
                                        value={localValues.applies_to_categories || []}
                                        onChange={(value) => handleChange({ applies_to_categories: value })}
                                        placeholder="Select categories to include"
                                        emptyLabel="No categories available"
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Menu Items Tab */}
                        <TabsContent value="items" className="space-y-6 mt-0">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Item-Specific Targeting</CardTitle>
                                    <CardDescription>
                                        Select specific menu items this discount applies to. Leave empty to apply to all items.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <MenuItemPicker
                                        options={menuItems}
                                        value={localValues.menu_item_ids || []}
                                        onChange={(value) => handleChange({ menu_item_ids: value })}
                                        placeholder="Select menu items"
                                        emptyLabel="No menu items available"
                                    />
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Exclusions Tab */}
                        <TabsContent value="exclusions" className="space-y-6 mt-0">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Exclude Categories</CardTitle>
                                    <CardDescription>
                                        Select categories to exclude from this discount
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <CategoryPicker
                                        options={categories}
                                        value={localValues.exclude_categories || []}
                                        onChange={(value) => handleChange({ exclude_categories: value })}
                                        placeholder="Select categories to exclude"
                                        emptyLabel="No categories available"
                                    />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Exclude Alcohol</CardTitle>
                                    <CardDescription>
                                        Automatically exclude items flagged as alcohol from this discount
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between rounded-md border p-4">
                                        <div className="space-y-0.5">
                                            <Label>Exclude alcohol items</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Skip items with alcohol tax category
                                            </p>
                                        </div>
                                        <Switch
                                            checked={localValues.exclude_alcohol || false}
                                            onCheckedChange={(checked) =>
                                                handleChange({ exclude_alcohol: checked })
                                            }
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </BottomSheetBody>

                <BottomSheetFooter className="flex gap-3">
                    <Button variant="outline" onClick={handleCancel} className="flex-1">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} className="flex-1">
                        Save Targeting
                    </Button>
                </BottomSheetFooter>
            </BottomSheetContent>
        </BottomSheet>
    )
}

