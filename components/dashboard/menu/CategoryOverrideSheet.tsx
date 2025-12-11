'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Tag, MapPin, RotateCcw, Save, Info, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react'
import { LevelIndicator, EditingContextBanner } from './LevelIndicator'
import { CategoriesModel } from '@/types/db-modles'

export interface CategoryOverride {
    isActive?: boolean
    displayOrder?: number
    customTitle?: string
}

export interface CategoryOverrideSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    category: CategoriesModel | null
    locationName: string
    locationId: string
    currentOverride?: CategoryOverride
    onSave: (override: CategoryOverride) => Promise<{ success?: boolean; error?: string }>
    onReset: () => Promise<{ success?: boolean; error?: string }>
}

export function CategoryOverrideSheet({
    open,
    onOpenChange,
    category,
    locationName,
    locationId,
    currentOverride,
    onSave,
    onReset,
}: CategoryOverrideSheetProps) {
    const [isActive, setIsActive] = useState(true)
    const [displayOrder, setDisplayOrder] = useState<number>(0)
    const [customTitle, setCustomTitle] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isResetting, setIsResetting] = useState(false)

    // Initialize state from category and override
    useEffect(() => {
        if (category) {
            setIsActive(currentOverride?.isActive ?? category.is_active ?? true)
            setDisplayOrder(currentOverride?.displayOrder ?? category.display_order ?? 0)
            setCustomTitle(currentOverride?.customTitle ?? '')
        }
    }, [category, currentOverride])

    const hasChanges = () => {
        if (!category) return false
        const originalActive = currentOverride?.isActive ?? category.is_active ?? true
        const originalOrder = currentOverride?.displayOrder ?? category.display_order ?? 0
        const originalTitle = currentOverride?.customTitle ?? ''

        return isActive !== originalActive ||
            displayOrder !== originalOrder ||
            customTitle !== originalTitle
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const result = await onSave({
                isActive,
                displayOrder,
                customTitle: customTitle.trim() || undefined,
            })

            if (result.error) {
                toast.error('Save Failed', { description: result.error })
                return
            }

            toast.success('Override Saved', {
                description: `Category settings for ${locationName} have been updated.`
            })
            onOpenChange(false)
        } catch {
            toast.error('Save Failed', {
                description: 'Unable to save override. Please try again.'
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleReset = async () => {
        setIsResetting(true)
        try {
            const result = await onReset()

            if (result.error) {
                toast.error('Reset Failed', { description: result.error })
                return
            }

            toast.success('Override Reset', {
                description: 'Category will now use global settings.'
            })
            onOpenChange(false)
        } catch {
            toast.error('Reset Failed', {
                description: 'Unable to reset override. Please try again.'
            })
        } finally {
            setIsResetting(false)
        }
    }

    if (!category) return null

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Customize Category
                    </SheetTitle>
                    <SheetDescription>
                        Override settings for "{category.name}" at {locationName}
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 py-6">
                    {/* Context Banner */}
                    <EditingContextBanner
                        level={2}
                        locationName={locationName}
                        categoryName={category.name}
                    />

                    {/* Global Settings Reference */}
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Info className="h-4 w-4 text-muted-foreground" />
                            Global Settings
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-muted-foreground">Status:</span>
                                <Badge variant={category.is_active ? "default" : "secondary"} className="ml-2">
                                    {category.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Order:</span>
                                <span className="ml-2 font-medium">{category.display_order ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Location Override Settings */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">Location Override</span>
                            <LevelIndicator level={2} variant="inline" />
                        </div>

                        {/* Visibility Toggle */}
                        <div className="flex items-center justify-between rounded-lg border p-4">
                            <div className="space-y-1">
                                <Label htmlFor="is-active" className="font-medium">
                                    Category Visibility
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {isActive
                                        ? 'This category is visible at this location'
                                        : 'This category is hidden at this location'
                                    }
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="is-active"
                                    checked={isActive}
                                    onCheckedChange={setIsActive}
                                />
                                {isActive ? (
                                    <Eye className="h-4 w-4 text-green-500" />
                                ) : (
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>
                        </div>

                        {/* Display Order */}
                        <div className="space-y-2">
                            <Label htmlFor="display-order">Display Order</Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setDisplayOrder(prev => Math.max(0, prev - 1))}
                                    disabled={displayOrder <= 0}
                                >
                                    <ArrowDown className="h-4 w-4" />
                                </Button>
                                <Input
                                    id="display-order"
                                    type="number"
                                    min={0}
                                    value={displayOrder}
                                    onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                                    className="w-20 text-center"
                                />
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setDisplayOrder(prev => prev + 1)}
                                >
                                    <ArrowUp className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Lower numbers appear first
                            </p>
                        </div>

                        {/* Custom Title */}
                        <div className="space-y-2">
                            <Label htmlFor="custom-title">Custom Title (Optional)</Label>
                            <Input
                                id="custom-title"
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                placeholder={category.name}
                            />
                            <p className="text-xs text-muted-foreground">
                                Override the category name at this location
                            </p>
                        </div>
                    </div>
                </div>

                <SheetFooter className="gap-2 sm:gap-0">
                    {currentOverride && (
                        <Button
                            variant="outline"
                            onClick={handleReset}
                            disabled={isResetting || isSaving}
                            className="gap-2"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Reset to Global
                        </Button>
                    )}
                    <div className="flex-1" />
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving || isResetting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges() || isSaving || isResetting}
                        className="gap-2"
                    >
                        {isSaving ? (
                            <>
                                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                Save Override
                            </>
                        )}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}

