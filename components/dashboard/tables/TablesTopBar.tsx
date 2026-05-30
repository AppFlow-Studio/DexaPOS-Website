'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Edit } from 'lucide-react'
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
        <div className="flex items-center justify-between gap-2 p-3 border-b bg-background">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    {location && (
                        <span className="text-sm font-semibold text-foreground truncate max-w-[90px] sm:max-w-none">{location.name}</span>
                    )}
                    {floorPlans && floorPlans.length > 0 && onFloorPlanChange && (
                        <>
                            <span className="text-sm text-muted-foreground shrink-0">•</span>
                            <Select
                                value={activeFloorPlanId || ''}
                                onValueChange={onFloorPlanChange}
                            >
                                <SelectTrigger className="w-[140px] sm:w-[220px] h-8 text-xs">
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

            <div className="flex items-center gap-2 shrink-0">
                <Button variant="default" size="sm" onClick={onEditLayout} className="h-8 text-xs px-3">
                    <Edit className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                </Button>
            </div>
        </div>
    )
}

