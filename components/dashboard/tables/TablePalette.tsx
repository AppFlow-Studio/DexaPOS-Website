'use client'

import * as React from 'react'
import { TABLE_SHAPES, SHAPE_OPTIONS } from '@/utils/tables/table-shapes'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table2, Sofa, Wrench, Building2, Flower2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TablePaletteProps {
    onTableSelect: (shapeId: keyof typeof TABLE_SHAPES) => void
    onAddMultiple?: () => void
}

const categoryIcons = {
    table: Table2,
    booth: Sofa,
    functional: Wrench,
    structure: Building2,
    decor: Flower2,
}

const categoryLabels = {
    table: 'Tables',
    booth: 'Booths',
    functional: 'Functional',
    structure: 'Structure',
    decor: 'Decorative',
}

export function TablePalette({ onTableSelect, onAddMultiple }: TablePaletteProps) {
    const groupedShapes = React.useMemo(() => {
        const groups: Record<string, typeof SHAPE_OPTIONS> = {
            table: [],
            booth: [],
            functional: [],
            structure: [],
            decor: [],
        }

        SHAPE_OPTIONS.forEach((shape) => {
            if (groups[shape.category]) {
                groups[shape.category].push(shape)
            }
        })

        return groups
    }, [])

    return (
        <Card className="w-80 h-full flex flex-col">
            <CardHeader>
                <CardTitle>Table Palette</CardTitle>
                <CardDescription>Drag or click to add tables to the floor plan</CardDescription>
                {onAddMultiple && (
                    <Button variant="outline" size="sm" onClick={onAddMultiple} className="mt-2">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Multiple
                    </Button>
                )}
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
                <Tabs defaultValue="table" className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="table">Tables</TabsTrigger>
                        <TabsTrigger value="booth">Booths</TabsTrigger>
                        <TabsTrigger value="other">Other</TabsTrigger>
                    </TabsList>

                    <div className="flex-1 mt-4 overflow-y-auto">
                        <TabsContent value="table" className="space-y-4 mt-0">
                            {groupedShapes.table.map((shape) => (
                                <div
                                    key={shape.id}
                                    className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                    onClick={() => onTableSelect(shape.id as keyof typeof TABLE_SHAPES)}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('shapeId', shape.id)
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0">
                                            <shape.component
                                                color="#F1F1F1"
                                                width={60}
                                                height={60}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">{shape.label}</div>
                                            {shape.capacity > 0 && (
                                                <Badge variant="secondary" className="text-xs mt-1">
                                                    {shape.capacity} seats
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </TabsContent>

                        <TabsContent value="booth" className="space-y-4 mt-0">
                            {groupedShapes.booth.map((shape) => (
                                <div
                                    key={shape.id}
                                    className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                    onClick={() => onTableSelect(shape.id as keyof typeof TABLE_SHAPES)}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('shapeId', shape.id)
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0">
                                            <shape.component
                                                color="#F1F1F1"
                                                width={60}
                                                height={60}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm">{shape.label}</div>
                                            {shape.capacity > 0 && (
                                                <Badge variant="secondary" className="text-xs mt-1">
                                                    {shape.capacity} seats
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </TabsContent>

                        <TabsContent value="other" className="space-y-4 mt-0">
                            {['functional', 'structure', 'decor'].map((category) => (
                                <div key={category} className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground px-1">
                                        {React.createElement(categoryIcons[category as keyof typeof categoryIcons], {
                                            className: 'h-4 w-4',
                                        })}
                                        {categoryLabels[category as keyof typeof categoryLabels]}
                                    </div>
                                    {groupedShapes[category as keyof typeof groupedShapes].map((shape) => (
                                        <div
                                            key={shape.id}
                                            className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                            onClick={() => onTableSelect(shape.id as keyof typeof TABLE_SHAPES)}
                                            draggable
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData('shapeId', shape.id)
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex-shrink-0">
                                                    <shape.component
                                                        color="#F1F1F1"
                                                        width={60}
                                                        height={60}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm">{shape.label}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </TabsContent>
                    </div>
                </Tabs>
            </CardContent>
        </Card>
    )
}

