'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TABLE_SHAPES } from '@/utils/tables/table-shapes'

interface QuickTableSetupDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onApply: (items: Array<{ shapeId: keyof typeof TABLE_SHAPES; quantity: number }>) => void
}

const seatingShapes = Object.values(TABLE_SHAPES).filter((shape) => shape.type === 'table')
const QUICK_SETUP_SHAPE_COLOR = '#d4d4d4'

export function QuickTableSetupDialog({
    open,
    onOpenChange,
    onApply,
}: QuickTableSetupDialogProps) {
    const [quantities, setQuantities] = React.useState<Record<string, string>>({})

    React.useEffect(() => {
        if (!open) {
            setQuantities({})
        }
    }, [open])

    const handleQuantityChange = (shapeId: string, value: string) => {
        const sanitized = value.replace(/\D/g, '').slice(0, 2)
        setQuantities((current) => ({
            ...current,
            [shapeId]: sanitized,
        }))
    }

    const selectedCount = React.useMemo(() => {
        return Object.values(quantities).reduce((sum, value) => sum + (parseInt(value, 10) || 0), 0)
    }, [quantities])

    const handleApply = () => {
        const items = seatingShapes
            .map((shape) => ({
                shapeId: shape.id as keyof typeof TABLE_SHAPES,
                quantity: parseInt(quantities[shape.id] || '0', 10) || 0,
            }))
            .filter((item) => item.quantity > 0)

        if (items.length === 0) {
            onOpenChange(false)
            return
        }

        onApply(items)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl gap-0 overflow-hidden border border-border bg-background p-0 text-foreground">
                <DialogHeader className="border-b border-border px-5 py-4">
                    <DialogTitle className="text-lg font-semibold text-foreground">Quick Floor Setup</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        Add multiple tables and booths in one pass using the shared SVG shape registry.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[460px]">
                    <div className="space-y-2.5 px-5 py-4">
                        {seatingShapes.map((shape) => {
                            const ShapeIcon = shape.component
                            return (
                                <div
                                    key={shape.id}
                                    className="grid items-center gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-[64px_minmax(0,1fr)_96px]"
                                >
                                    <div className="flex h-14 w-14 items-center justify-center rounded-md">
                                        <ShapeIcon width={52} height={52} color={QUICK_SETUP_SHAPE_COLOR} />
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium text-foreground">{shape.label}</p>
                                            {shape.capacity > 0 && (
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {shape.capacity} seats
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {shape.category === 'booth' ? 'Booth seating' : 'Standard table'}
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor={`quick-setup-${shape.id}`}
                                            className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
                                        >
                                            Quantity
                                        </label>
                                        <Input
                                            id={`quick-setup-${shape.id}`}
                                            inputMode="numeric"
                                            value={quantities[shape.id] || ''}
                                            onChange={(event) => handleQuantityChange(shape.id, event.target.value)}
                                            placeholder="0"
                                            className="h-9 border-border bg-background text-center text-sm font-semibold text-foreground placeholder:text-muted-foreground"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>

                <DialogFooter className="border-t border-border bg-muted/20 px-5 py-3">
                    <div className="mr-auto text-sm text-muted-foreground">
                        {selectedCount > 0 ? `${selectedCount} objects will be added` : 'No objects selected'}
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Start with Blank Canvas
                    </Button>
                    <Button
                        onClick={handleApply}
                    >
                        Add Objects
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
