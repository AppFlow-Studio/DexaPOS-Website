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
            {/* Mobile: a bottom sheet — anchored to bottom-0 with a rounded top,
                capped at 92dvh so the surface behind stays visible. Matches
                CreateReservationDialog. `sm:` restores the centred card. */}
            <DialogContent className="tables-pill-controls max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-auto max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-hidden max-sm:rounded-b-none max-sm:rounded-t-[28px] sm:rounded-3xl sm:w-[96vw] sm:max-w-[1120px] gap-0 overflow-hidden border border-border bg-background p-0 text-foreground flex flex-col sm:max-h-[90vh]">
                <DialogHeader className="px-5 pt-5 pb-2 shrink-0">
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
                                className="h-10 rounded-xl border-transparent bg-muted/50 text-sm text-foreground placeholder:text-muted-foreground"
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault()
                                        handleSubmit()
                                    }
                                }}
                            />
                        </div>

                        <div className="rounded-2xl bg-muted/50 p-3">
                            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                Selected shape
                            </p>
                                <div className="mt-2">
                                {(() => {
                                    const selectedShape = TABLE_SHAPES[selectedShapeId]
                                    const SelectedShapeIcon = selectedShape.component
                                    return (
                                        <div className="space-y-2.5">
                                            {/* One surface, not three: the panel already draws a
                                                boundary, so the preview well is borderless. */}
                                            <div className="flex h-20 items-center justify-center rounded-2xl bg-background">
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
                            <TabsList className="grid w-full grid-cols-3 gap-0.5 rounded-full bg-muted/70 p-1 lg:grid-cols-6">
                                {CATEGORY_ORDER.map((category) => (
                                    <TabsTrigger
                                        key={category}
                                        value={category}
                                        className="rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                                    >
                                        {CATEGORY_LABELS[category]}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {CATEGORY_ORDER.map((category) => (
                                <TabsContent key={category} value={category} className="mt-3">
                                    <ScrollArea className="h-[45vh] lg:h-[420px] rounded-2xl p-2">
                                        <div className="grid gap-3 p-2 md:grid-cols-2 xl:grid-cols-3">
                                            {shapesByCategory[category].map((shape) => {
                                                const ShapeIcon = shape.component
                                                const isSelected = selectedShapeId === shape.id
                                                return (
                                                    <button
                                                        key={shape.id}
                                                        type="button"
                                                        onClick={() => setSelectedShapeId(shape.id as keyof typeof TABLE_SHAPES)}
                                                        className={`rounded-2xl border-0 p-3 text-left shadow-none transition-colors ${
                                                            isSelected
                                                                ? 'bg-primary/10'
                                                                : 'bg-muted/50 hover:bg-muted'
                                                        }`}
                                                    >
                                                        {/* Borderless: the tile itself carries the
                                                            boundary, so a second ring inside it
                                                            just doubles the outline. */}
                                                        <div className="flex h-20 items-center justify-center rounded-2xl bg-muted/40">
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

                <DialogFooter className="px-4 sm:px-5 pt-2 pb-5 flex-col sm:flex-row gap-2">
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
