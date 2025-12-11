import { ModifierGroupItemsModel } from "@/types/db-modles"
import React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, MapPin } from "lucide-react"
import { ModifierOverrideDialog } from "./ModifierOverrideDialog"

// EXTEND ModifierGroupItemsModel to include the calculated fields from your SQL
export interface ExtendedModifierItem extends ModifierGroupItemsModel {
    price_modifier: number
    is_active: boolean
    stock_tracking_mode: 'quantity' | 'in_stock' | 'out_of_stock'
    current_stock: number | null
    // Helper to know if it's an override
    is_override?: boolean
}

interface ModifierItemRowProps {
    item: ExtendedModifierItem
    locationId: string
    onUpdate: () => void
}

export default function ModifierItemRow({ item, locationId, onUpdate }: ModifierItemRowProps) {
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)

    // Helper to determine status color
    const getStockColor = () => {
        if (!item.is_active) return "text-muted-foreground line-through"
        if (item.stock_tracking_mode === 'out_of_stock') return "text-destructive"
        if (item.stock_tracking_mode === 'quantity' && (item.current_stock || 0) <= 0) return "text-destructive"
        if (item.stock_tracking_mode === 'quantity' && (item.current_stock || 0) < 5) return "text-orange-500"
        return ""
    }

    const handleOpenDialog = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setIsDialogOpen(false)
    }

    const handleSuccess = () => {
        onUpdate()
        setIsDialogOpen(false)
    }

    console.log('modifier item MODIFIER ITEM ROW', item)

    return (
        <>
            <div
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted group transition-colors text-sm border border-transparent hover:border-border cursor-pointer"
                onClick={handleOpenDialog}
            >
                <div className="flex items-center gap-3">
                    {/* Stock Status Dot */}
                    <div className={cn("w-2 h-2 rounded-full shrink-0",
                        !item.is_active ? "bg-gray-300" :
                            item.stock_tracking_mode === 'out_of_stock' ? "bg-red-500" :
                                item.stock_tracking_mode === 'quantity' && (item.current_stock || 0) <= 0 ? "bg-red-500" :
                                    item.stock_tracking_mode === 'quantity' && (item.current_stock || 0) < 5 ? "bg-orange-500" :
                                        "bg-green-500"
                    )} />

                    <div className="flex flex-col min-w-0">
                        <span className={cn("font-medium truncate", getStockColor())}>
                            {item.name}
                            {item.is_override && (
                                <Badge variant="outline" className="ml-2 text-[9px] h-4 px-1 bg-blue-50 text-blue-600 border-blue-200">
                                    <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                    Override
                                </Badge>
                            )}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {/* Price */}
                            <span className={item.price_modifier > 0 ? "text-green-600" : ""}>
                                {item.price_modifier > 0 ? `+$${item.price_modifier.toFixed(2)}` : 'Free'}
                            </span>
                            <span>•</span>
                            {/* Stock Text */}
                            <span className={cn(
                                item.stock_tracking_mode === 'out_of_stock' && "text-red-500",
                                item.stock_tracking_mode === 'quantity' && (item.current_stock || 0) <= 0 && "text-red-500"
                            )}>
                                {item.stock_tracking_mode === 'in_stock' && "In Stock"}
                                {item.stock_tracking_mode === 'out_of_stock' && "Sold Out"}
                                {item.stock_tracking_mode === 'quantity' && `${item.current_stock ?? 0} left`}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Edit Action */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={handleOpenDialog}
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* The Override Dialog - Always rendered, controlled by open prop */}
            <ModifierOverrideDialog
                item={item}
                locationId={locationId}
                isOpen={isDialogOpen}
                onClose={handleCloseDialog}
                onSuccess={handleSuccess}
            />
        </>
    )
}