'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, Edit } from 'lucide-react'
import { Location } from '@/types/merchant_locations'

interface TablesTopBarProps {
    location: Location | null
    searchQuery: string
    onSearchChange: (query: string) => void
    onBack?: () => void
    onEditLayout: () => void
}

export function TablesTopBar({
    location,
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
                        <>
                            <span className="text-sm text-muted-foreground">{location.name}</span>
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

