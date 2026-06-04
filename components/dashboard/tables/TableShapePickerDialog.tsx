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
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TABLE_SHAPES, SHAPE_OPTIONS } from '@/utils/tables/table-shapes'

type ShapeCategory = 'table' | 'booth' | 'functional' | 'structure' | 'decor' | 'zone'

interface TableShapePickerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onAdd: (payload: {
        shapeId: keyof typeof TABLE_SHAPES
        name?: string
    }) => void
}

const CATEGORY_ORDER: ShapeCategory[] = ['table', 'booth', 'functional', 'structure', 'decor', 'zone']

const CATEGORY_LABELS: Record<ShapeCategory, string> = {
    table: 'Tables',
    booth: 'Booths',
    functional: 'Functional',
    structure: 'Structure',
    decor: 'Decor',
    zone: 'Zones',
}

const SHAPE_ACTIVE_COLOR = '#3b82f6'
const SHAPE_DEFAULT_COLOR = '#9CA3AF'

export function TableShapePickerDialog({
    open,
    onOpenChange,
    onAdd,
}: TableShapePickerDialogProps) {
    const [name, setName] = React.useState('')
    const [selectedShapeId, setSelectedShapeId] = React.useState<keyof typeof TABLE_SHAPES>(
        SHAPE_OPTIONS[0]?.id as keyof typeof TABLE_SHAPES
    )
    const [activeCategory, setActiveCategory] = React.useState<ShapeCategory>('table')

    React.useEffect(() => {
        if (!open) {
            setName('')
            setSelectedShapeId(SHAPE_OPTIONS[0]?.id as keyof typeof TABLE_SHAPES)
            setActiveCategory('table')
        }
    }, [open])

    const shapesByCategory = React.useMemo(() => {
        return CATEGORY_ORDER.reduce<Record<ShapeCategory, typeof SHAPE_OPTIONS>>((acc, category) => {
            acc[category] = SHAPE_OPTIONS.filter((shape) => shape.category === category)
            return acc
        }, {
            table: [],
            booth: [],
            functional: [],
            structure: [],
            decor: [],
            zone: [],
        })
    }, [])

    const handleSubmit = () => {
        const trimmedName = name.trim()

        onAdd({
            shapeId: selectedShapeId,
            name: trimmedName || undefined,
        })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] sm:w-[96vw] sm:max-w-[1120px] max-w-[1120px] gap-0 overflow-hidden border border-border bg-background p-0 text-foreground flex flex-col max-h-[90vh]">
                <DialogHeader className="border-b border-border px-5 py-4 shrink-0">
                    <DialogTitle className="text-lg font-semibold text-foreground">Add New Object</DialogTitle>
                    <DialogDescription className="text-sm text-muted-foreground">
                        Pick a shape from the shared SVG library and drop a named object into the floor plan.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 px-4 sm:px-5 py-4 lg:grid-cols-[240px_minmax(680px,1fr)] overflow-y-auto flex-1">
                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="new-floor-object-name" className="text-sm font-medium text-foreground">
                                Object name
                            </Label>
                            <Input
                                id="new-floor-object-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Table 12 or Main Bar"
                                className="h-10 border-border bg-background text-sm text-foreground placeholder:text-muted-foreground"
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault()
                                        handleSubmit()
                                    }
                                }}
                            />
                        </div>

                        <div className="rounded-md border border-border bg-muted/20 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                Selected shape
                            </p>
                                <div className="mt-2 rounded-md border border-border bg-background p-3 shadow-sm">
                                {(() => {
                                    const selectedShape = TABLE_SHAPES[selectedShapeId]
                                    const SelectedShapeIcon = selectedShape.component
                                    return (
                                        <div className="space-y-2.5">
                                            <div className="flex h-20 items-center justify-center rounded-md border border-border bg-muted/30">
                                                <SelectedShapeIcon width={76} height={76} color={SHAPE_ACTIVE_COLOR} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-foreground">{selectedShape.label}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {CATEGORY_LABELS[selectedShape.category as ShapeCategory]}
                                                </p>
                                            </div>
                                            {selectedShape.capacity > 0 && (
                                                <Badge variant="secondary" className="w-fit text-[10px]">
                                                    {selectedShape.capacity} seats
                                                </Badge>
                                            )}
                                        </div>
                                    )
                                })()}
                            </div>
                        </div>
                    </div>

                    <div className="min-w-0">
                        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as ShapeCategory)}>
                            <TabsList className="grid w-full grid-cols-3 bg-muted/40 lg:grid-cols-6">
                                {CATEGORY_ORDER.map((category) => (
                                    <TabsTrigger
                                        key={category}
                                        value={category}
                                        className="px-2 text-xs text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground"
                                    >
                                        {CATEGORY_LABELS[category]}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {CATEGORY_ORDER.map((category) => (
                                <TabsContent key={category} value={category} className="mt-3">
                                    <ScrollArea className="h-[45vh] lg:h-[420px] rounded-md border border-border bg-muted/10 p-2">
                                        <div className="grid gap-3 p-2 md:grid-cols-2 xl:grid-cols-3">
                                            {shapesByCategory[category].map((shape) => {
                                                const ShapeIcon = shape.component
                                                const isSelected = selectedShapeId === shape.id
                                                return (
                                                    <button
                                                        key={shape.id}
                                                        type="button"
                                                        onClick={() => setSelectedShapeId(shape.id as keyof typeof TABLE_SHAPES)}
                                                        className={`rounded-md border p-3 text-left transition-all ${
                                                            isSelected
                                                                ? 'border-primary/60 bg-primary/10 shadow-sm'
                                                                : 'border-border bg-background hover:border-primary/40'
                                                        }`}
                                                    >
                                                        <div className="flex h-20 items-center justify-center rounded-md border border-border bg-muted/30">
                                                            <ShapeIcon
                                                                width={74}
                                                                height={74}
                                                                color={isSelected ? SHAPE_ACTIVE_COLOR : SHAPE_DEFAULT_COLOR}
                                                            />
                                                        </div>
                                                        <div className="mt-2 space-y-1.5">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div>
                                                                    <p className={`text-sm font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                                                        {shape.label}
                                                                    </p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {CATEGORY_LABELS[shape.category as ShapeCategory]}
                                                                    </p>
                                                                </div>
                                                                {shape.capacity > 0 && (
                                                                    <Badge variant="secondary" className="text-[10px]">
                                                                        {shape.capacity}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </ScrollArea>
                                </TabsContent>
                            ))}
                        </Tabs>
                    </div>
                </div>

                <DialogFooter className="border-t border-border bg-muted/20 px-4 sm:px-5 py-3 flex-col sm:flex-row gap-2">
                    <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 sm:flex-none"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            className="flex-1 sm:flex-none"
                        >
                            Add Object
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
