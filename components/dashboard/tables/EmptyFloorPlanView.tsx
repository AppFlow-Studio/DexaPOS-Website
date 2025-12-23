'use client'

import * as React from 'react'
import { LayoutGrid, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyFloorPlanViewProps {
    locationName?: string
    onCreateFloorPlan: () => void
}

export function EmptyFloorPlanView({ locationName, onCreateFloorPlan }: EmptyFloorPlanViewProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[500px] p-8">
            <div className="flex flex-col items-center gap-6 max-w-md text-center">
                {/* Icon */}
                <div className="relative">
                    <div className="absolute inset-0 bg-primary/10 rounded-full blur-2xl" />
                    <div className="relative bg-muted rounded-full p-6">
                        <LayoutGrid className="h-12 w-12 text-muted-foreground" />
                    </div>
                </div>

                {/* Content */}
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-foreground">
                        No Floor Plans Yet
                    </h2>
                    <p className="text-muted-foreground">
                        {locationName ? (
                            <>
                                Create your first floor plan for <span className="font-medium text-foreground">{locationName}</span> to start managing tables and reservations.
                            </>
                        ) : (
                            'Create your first floor plan to start managing tables and reservations.'
                        )}
                    </p>
                </div>

                {/* CTA Button */}
                <Button
                    onClick={onCreateFloorPlan}
                    size="lg"
                    className="mt-4"
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Floor Plan
                </Button>
            </div>
        </div>
    )
}

