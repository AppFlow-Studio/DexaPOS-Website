'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useModifierItemOverrideMutation, useResetModifierItemMutation } from '@/app/dashboard/hooks/useLocationScopedModifiers'

interface ModifierItemOverrideDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    item: {
        id: string
        name: string
        price_modifier: number
        display_order: number | null
        is_active: boolean
    }
    locationName: string
}

export function ModifierItemOverrideDialog({
    open,
    onOpenChange,
    item,
    locationName,
}: ModifierItemOverrideDialogProps) {
    const overrideMutation = useModifierItemOverrideMutation()
    const resetMutation = useResetModifierItemMutation()

    const [priceModifier, setPriceModifier] = useState(item.price_modifier.toString())
    const [displayOrder, setDisplayOrder] = useState(item.display_order?.toString() || '')
    const [isActive, setIsActive] = useState(item.is_active)
    const [stockMode, setStockMode] = useState<string>('none')
    const [currentStock, setCurrentStock] = useState('')

    // Reset form when item changes
    useEffect(() => {
        setPriceModifier(item.price_modifier.toString())
        setDisplayOrder(item.display_order?.toString() || '')
        setIsActive(item.is_active)
        setStockMode('none')
        setCurrentStock('')
    }, [item])

    const handleSave = async () => {
        overrideMutation.mutate({
            modifierItemId: item.id,
            data: {
                price_modifier: parseFloat(priceModifier),
                display_order: displayOrder ? parseInt(displayOrder) : undefined,
                is_active: isActive,
                stock_tracking_mode: stockMode !== 'none' ? stockMode as any : undefined,
                current_stock: currentStock ? parseInt(currentStock) : undefined,
            }
        }, {
            onSuccess: () => {
                onOpenChange(false)
            }
        })
    }

    const handleReset = async () => {
        resetMutation.mutate(item.id, {
            onSuccess: () => {
                onOpenChange(false)
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Customize "{item.name}"</DialogTitle>
                    <DialogDescription>
                        Set location-specific settings for <Badge variant="secondary">{locationName}</Badge>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Visibility Toggle */}
                    <div className="flex items-center justify-between">
                        <Label htmlFor="is-active">Visible at this location</Label>
                        <Switch
                            id="is-active"
                            checked={isActive}
                            onCheckedChange={setIsActive}
                        />
                    </div>

                    {/* Price Modifier */}
                    <div className="space-y-2">
                        <Label htmlFor="price-modifier">Price Modifier</Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                            <Input
                                id="price-modifier"
                                type="number"
                                step="0.01"
                                value={priceModifier}
                                onChange={(e) => setPriceModifier(e.target.value)}
                                className="pl-7"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Amount to add to base item price (use negative for discounts)
                        </p>
                    </div>

                    {/* Display Order */}
                    <div className="space-y-2">
                        <Label htmlFor="display-order">Display Order (Optional)</Label>
                        <Input
                            id="display-order"
                            type="number"
                            value={displayOrder}
                            onChange={(e) => setDisplayOrder(e.target.value)}
                            placeholder="Leave empty for default order"
                        />
                        <p className="text-xs text-muted-foreground">
                            Override the order this option appears at this location
                        </p>
                    </div>

                    {/* Stock Tracking */}
                    <div className="space-y-2">
                        <Label htmlFor="stock-mode">Stock Tracking (Optional)</Label>
                        <Select value={stockMode} onValueChange={setStockMode}>
                            <SelectTrigger id="stock-mode">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No tracking</SelectItem>
                                <SelectItem value="in_stock">In Stock</SelectItem>
                                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                                <SelectItem value="quantity">Track Quantity</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Track availability at this specific location
                        </p>
                    </div>

                    {stockMode === 'quantity' && (
                        <div className="space-y-2">
                            <Label htmlFor="current-stock">Current Stock</Label>
                            <Input
                                id="current-stock"
                                type="number"
                                value={currentStock}
                                onChange={(e) => setCurrentStock(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleReset}
                        disabled={resetMutation.isPending}
                    >
                        Reset to Global
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={overrideMutation.isPending}
                    >
                        {overrideMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
