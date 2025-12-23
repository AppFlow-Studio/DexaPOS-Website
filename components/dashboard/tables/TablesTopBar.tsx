'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Search, Edit } from 'lucide-react'
import { Location } from '@/types/merchant_locations'
import { FloorPlan } from '@/types/floor-plan'

interface TablesTopBarProps {
    location: Location | null
    floorPlans?: FloorPlan[]
    activeFloorPlanId?: string | null
    onFloorPlanChange?: (floorPlanId: string) => void
    searchQuery: string
    onSearchChange: (query: string) => void
    onBack?: () => void
    onEditLayout: () => void
}

export function TablesTopBar({
    location,
    floorPlans,
    activeFloorPlanId,
    onFloorPlanChange,
    searchQuery,
    onSearchChange,
    onBack,
    onEditLayout,
}: TablesTopBarProps) {
    return (
        <div className="flex items-center justify-between gap-4 p-4 border-b bg-background">
            <div className="flex items-center gap-4 flex-1">
                {/* {onBack && (
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                    </Button>
                )} */}
                <div className="flex items-center gap-2">
                    {location && (
                        <span className="text-sm font-semibold text-foreground">{location.name}</span>
                    )}
                    {floorPlans && floorPlans.length > 0 && onFloorPlanChange && (
                        <>
                            <span className="text-sm text-muted-foreground">•</span>
                            <Select
                                value={activeFloorPlanId || ''}
                                onValueChange={onFloorPlanChange}
                            >
                                <SelectTrigger className="w-[250px]">
                                    <SelectValue placeholder="Select floor plan" />
                                </SelectTrigger>
                                <SelectContent>
                                    {floorPlans.map((fp) => (
                                        <SelectItem key={fp.id} value={fp.id}>
                                            <div className="flex items-center justify-between w-full">
                                                <span>{fp.name}</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    {fp.is_default && '(Default)'}
                                                    {fp.table_count !== undefined && ` • ${fp.table_count} tables`}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search table name..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Button variant="default" size="sm" onClick={onEditLayout}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Layout
                </Button>
            </div>
        </div>
    )
}

