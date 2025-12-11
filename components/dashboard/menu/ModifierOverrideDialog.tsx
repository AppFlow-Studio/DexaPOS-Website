import React from 'react'
import { upsertModifierOverride } from '@/app/dashboard/actions/menu-items-rpc'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { ModifierGroupItemsModel } from '@/types/db-modles'
import { MapPin, DollarSign, Package } from 'lucide-react'

// EXTEND ModifierGroupItemsModel to include the calculated fields from your SQL
export interface ExtendedModifierItem extends ModifierGroupItemsModel {
    price_modifier: number
    is_active: boolean
    stock_tracking_mode: 'quantity' | 'in_stock' | 'out_of_stock'
    current_stock: number | null
    // Helper to know if it's an override
    is_override?: boolean
}

interface ModifierOverrideFormProps {
    item: ExtendedModifierItem
    locationId: string
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export function ModifierOverrideDialog({ item, locationId, isOpen, onClose, onSuccess }: ModifierOverrideFormProps) {
    const [isLoading, setIsLoading] = React.useState(false)
    // Local state for the override form
    const [price, setPrice] = React.useState(item.price_modifier)
    const [isActive, setIsActive] = React.useState(item.is_active)
    const [stockMode, setStockMode] = React.useState(item.stock_tracking_mode)
    const [stock, setStock] = React.useState(item.current_stock ?? 0)

    // Reset form when item changes
    React.useEffect(() => {
        if (isOpen) {
            setPrice(item.price_modifier)
            setIsActive(item.is_active)
            setStockMode(item.stock_tracking_mode)
            setStock(item.current_stock ?? 0)
        }
    }, [isOpen, item])

    const handleSave = async () => {
        setIsLoading(true)
        try {
            const result = await upsertModifierOverride(
                locationId,
                item.id,
                price, // Send the new price
                isActive,
                stockMode,
                stockMode === 'quantity' ? stock : null
            )

            if (result.success) {
                toast.success("Modifier Updated", { description: "Location override saved." })
                onSuccess()
                onClose()
            } else {
                toast.error("Error", { description: "Failed to update modifier." })
            }
        } catch (e) {
            toast.error("Error", { description: "Network error occurred." })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose} >
            <DialogContent className="sm:max-w-[425px] z-[100]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-500" />
                        Edit Option: {item.name}
                    </DialogTitle>
                    <DialogDescription>
                        Set location-specific overrides for this modifier option
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Override Badge */}
                    {item.is_override && (
                        <Badge variant="outline" className="w-fit bg-blue-50 text-blue-600 border-blue-200">
                            <MapPin className="h-3 w-3 mr-1" />
                            Currently has location override
                        </Badge>
                    )}

                    {/* Availability */}
                    <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">Available at Location</Label>
                            <p className="text-xs text-muted-foreground">Toggle availability for this location only</p>
                        </div>
                        <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>

                    {/* Price Override */}
                    <div className="grid gap-2">
                        <Label className="flex items-center gap-2">
                            <DollarSign className="h-3.5 w-3.5 text-green-500" />
                            Price Modifier
                        </Label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="pl-7"
                                value={price}
                                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This amount is added to the base item price when selected
                        </p>
                    </div>

                    {/* Stock Management */}
                    <div className="grid gap-2">
                        <Label className="flex items-center gap-2">
                            <Package className="h-3.5 w-3.5 text-orange-500" />
                            Stock Tracking
                        </Label>
                        <Select value={stockMode} onValueChange={(v: 'in_stock' | 'out_of_stock' | 'quantity') => setStockMode(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[101]">
                                <SelectItem value="in_stock">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        Always In Stock
                                    </div>
                                </SelectItem>
                                <SelectItem value="out_of_stock">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        Out of Stock
                                    </div>
                                </SelectItem>
                                <SelectItem value="quantity">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                                        Track Quantity
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {stockMode === 'quantity' && (
                        <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                            <Label>Current Quantity</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min="0"
                                    value={stock}
                                    onChange={(e) => setStock(parseInt(e.target.value) || 0)}
                                    className="flex-1"
                                />
                                <span className="text-sm text-muted-foreground whitespace-nowrap">units</span>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving...
                            </>
                        ) : (
                            "Save Override"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}