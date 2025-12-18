'use client'

import * as React from 'react'
import { TableStatus } from '@/types/floor-plan'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface TableStatusBadgeProps {
    status: TableStatus | null
    className?: string
}

export function TableStatusBadge({ status, className }: TableStatusBadgeProps) {
    const getStatusConfig = (status: TableStatus | null) => {
        if (!status || status === 'available') {
            return {
                label: 'Available',
                variant: 'default' as const,
                className: 'bg-green-500 hover:bg-green-600',
            }
        }

        switch (status) {
            case 'seated':
            case 'ordered':
            case 'served':
            case 'check_presented':
                return {
                    label: 'In Use',
                    variant: 'default' as const,
                    className: 'bg-blue-500 hover:bg-blue-600',
                }
            case 'cleaning':
                return {
                    label: 'Needs Cleaning',
                    variant: 'destructive' as const,
                    className: 'bg-red-500 hover:bg-red-600',
                }
            case 'paid':
                return {
                    label: 'Overtime',
                    variant: 'secondary' as const,
                    className: 'bg-yellow-500 hover:bg-yellow-600 text-yellow-950',
                }
            case 'reserved':
                return {
                    label: 'Reserved',
                    variant: 'outline' as const,
                    className: '',
                }
            case 'blocked':
                return {
                    label: 'Blocked',
                    variant: 'secondary' as const,
                    className: 'bg-gray-500 hover:bg-gray-600',
                }
            case 'not_in_service':
                return {
                    label: 'Not in Service',
                    variant: 'outline' as const,
                    className: '',
                }
            default:
                return {
                    label: status,
                    variant: 'secondary' as const,
                    className: '',
                }
        }
    }

    const config = getStatusConfig(status)

    return (
        <Badge variant={config.variant} className={cn(config.className, className)}>
            {config.label}
        </Badge>
    )
}

