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
import { toast } from 'sonner'

type ShapeCategory = 'table' | 'booth' | 'functional' | 'structure' | 'decor' | 'zone'

interface TableShapePickerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onAdd: (payload: {
        shapeId: keyof typeof TABLE_SHAPES
        name: string
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
        if (!trimmedName) {
            toast.error('Enter a name for the new object.')
            return
        }

        onAdd({
            shapeId: selectedShapeId,
            name: trimmedName,
        })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl gap-0 overflow-hidden border border-gray-700 bg-[#2a2a2a] p-0 text-white">
                <DialogHeader className="border-b border-gray-700 px-6 py-5">
                    <DialogTitle className="text-2xl font-bold text-white">Add New Object</DialogTitle>
                    <DialogDescription className="text-base text-gray-400">
                        Pick a shape from the shared SVG library and drop a named object into the floor plan.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 px-6 py-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="new-floor-object-name" className="text-base font-medium text-gray-300">
                                Object name
                            </Label>
                            <Input
                                id="new-floor-object-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Table 12 or Main Bar"
                                className="h-14 border-gray-600 bg-[#1e1e1e] text-lg text-white placeholder:text-gray-500"
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault()
                                        handleSubmit()
                                    }
                                }}
                            />
                        </div>

                        <div className="rounded-xl border border-gray-700 bg-[#313131] p-4">
                            <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
                                Selected shape
                            </p>
                            <div className="mt-3 rounded-xl border border-gray-700 bg-[#1e1e1e] p-4 shadow-sm">
                                {(() => {
                                    const selectedShape = TABLE_SHAPES[selectedShapeId]
                                    const SelectedShapeIcon = selectedShape.component
                                    return (
                                        <div className="space-y-3">
                                            <div className="flex h-28 items-center justify-center rounded-xl border border-gray-700 bg-[#2a2a2a]">
                                                <SelectedShapeIcon width={112} height={112} color={SHAPE_ACTIVE_COLOR} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-white">{selectedShape.label}</p>
                                                <p className="text-xs text-gray-400">
                                                    {CATEGORY_LABELS[selectedShape.category as ShapeCategory]}
                                                </p>
                                            </div>
                                            {selectedShape.capacity > 0 && (
                                                <Badge className="w-fit bg-blue-500/10 text-blue-400 hover:bg-blue-500/10">
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
                            <TabsList className="grid w-full grid-cols-3 bg-[#313131] lg:grid-cols-6">
                                {CATEGORY_ORDER.map((category) => (
                                    <TabsTrigger
                                        key={category}
                                        value={category}
                                        className="text-gray-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                                    >
                                        {CATEGORY_LABELS[category]}
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {CATEGORY_ORDER.map((category) => (
                                <TabsContent key={category} value={category} className="mt-4">
                                    <ScrollArea className="h-[420px] rounded-xl border border-gray-700 bg-[#1e1e1e] p-1">
                                        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                                            {shapesByCategory[category].map((shape) => {
                                                const ShapeIcon = shape.component
                                                const isSelected = selectedShapeId === shape.id
                                                return (
                                                    <button
                                                        key={shape.id}
                                                        type="button"
                                                        onClick={() => setSelectedShapeId(shape.id as keyof typeof TABLE_SHAPES)}
                                                        className={`rounded-2xl border p-4 text-left transition-all ${
                                                            isSelected
                                                                ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                                                                : 'border-gray-700 bg-[#212121] hover:border-gray-600'
                                                        }`}
                                                    >
                                                        <div className="flex h-28 items-center justify-center rounded-xl border border-gray-700 bg-[#2a2a2a]">
                                                            <ShapeIcon
                                                                width={112}
                                                                height={112}
                                                                color={isSelected ? SHAPE_ACTIVE_COLOR : SHAPE_DEFAULT_COLOR}
                                                            />
                                                        </div>
                                                        <div className="mt-3 space-y-2">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div>
                                                                    <p className={`text-sm font-semibold ${isSelected ? 'text-blue-400' : 'text-gray-200'}`}>
                                                                        {shape.label}
                                                                    </p>
                                                                    <p className="text-xs text-gray-400">
                                                                        {CATEGORY_LABELS[shape.category as ShapeCategory]}
                                                                    </p>
                                                                </div>
                                                                {shape.capacity > 0 && (
                                                                    <Badge className={isSelected ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/10' : 'bg-[#313131] text-gray-300 hover:bg-[#313131]'}>
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

                <DialogFooter className="border-t border-gray-700 px-6 py-4">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="border-gray-700 bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        className="bg-blue-600 text-white hover:bg-blue-700"
                    >
                        Add Object
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
