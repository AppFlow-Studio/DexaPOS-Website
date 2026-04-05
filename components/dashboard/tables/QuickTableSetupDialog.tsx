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
            <DialogContent className="max-w-4xl gap-0 overflow-hidden border border-gray-700 bg-[#2a2a2a] p-0 text-white">
                <DialogHeader className="border-b border-gray-700 px-6 py-5">
                    <DialogTitle className="text-xl font-bold text-white">Quick Floor Setup</DialogTitle>
                    <DialogDescription className="text-base text-gray-400">
                        Add multiple tables and booths in one pass using the shared SVG shape registry.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[560px]">
                    <div className="space-y-3 px-6 py-6">
                        {seatingShapes.map((shape) => {
                            const ShapeIcon = shape.component
                            return (
                                <div
                                    key={shape.id}
                                    className="grid items-center gap-4 rounded-lg border border-gray-600 bg-[#3c3c3c] p-4 md:grid-cols-[88px_minmax(0,1fr)_120px]"
                                >
                                    <div className="flex h-20 w-20 items-center justify-center rounded-xl">
                                        <ShapeIcon width={72} height={72} color={QUICK_SETUP_SHAPE_COLOR} />
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-gray-200">{shape.label}</p>
                                            {shape.capacity > 0 && (
                                                <Badge className="bg-[#2a2a2a] text-gray-300 hover:bg-[#2a2a2a]">
                                                    {shape.capacity} seats
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-400">
                                            {shape.category === 'booth' ? 'Booth seating' : 'Standard table'}
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <label
                                            htmlFor={`quick-setup-${shape.id}`}
                                            className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400"
                                        >
                                            Quantity
                                        </label>
                                        <Input
                                            id={`quick-setup-${shape.id}`}
                                            inputMode="numeric"
                                            value={quantities[shape.id] || ''}
                                            onChange={(event) => handleQuantityChange(shape.id, event.target.value)}
                                            placeholder="0"
                                            className="h-12 border-gray-500 bg-[#2a2a2a] text-center text-lg font-semibold text-white placeholder:text-gray-500"
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>

                <DialogFooter className="border-t border-gray-700 bg-[#313131] px-6 py-4">
                    <div className="mr-auto text-sm text-gray-400">
                        {selectedCount > 0 ? `${selectedCount} objects will be added` : 'No objects selected'}
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="border-gray-600 bg-gray-600 text-white hover:bg-gray-500 hover:text-white"
                    >
                        Start with Blank Canvas
                    </Button>
                    <Button
                        onClick={handleApply}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                        Add Objects
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
