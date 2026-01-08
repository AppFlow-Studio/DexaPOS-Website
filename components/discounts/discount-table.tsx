'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Discount } from '@/types/discount'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

interface DiscountTableProps {
    discounts: Discount[]
    isLoading?: boolean
    onToggleStatus?: (id: string, isActive: boolean) => void
    onBulkStatus?: (ids: string[], isActive: boolean) => void
    onBulkDelete?: (ids: string[], mode?: 'soft' | 'hard') => void
    onDelete?: (id: string) => void
    onView?: (id: string) => void
    onEdit?: (id: string) => void
}

export function DiscountTable({
    discounts,
    isLoading,
    onToggleStatus,
    onBulkStatus,
    onBulkDelete,
    onDelete,
    onView,
    onEdit,
}: DiscountTableProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    const allSelected = useMemo(
        () => discounts.length > 0 && selectedIds.length === discounts.length,
        [discounts.length, selectedIds.length],
    )

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
    }

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds([])
        } else {
            setSelectedIds(discounts.map((d) => d.id))
        }
    }

    const formatValue = (discount: Discount) => {
        if (discount.discount_type === 'percentage') return `${discount.discount_value}%`
        return `$${discount.discount_value}`
    }

    const formatDateRange = (discount: Discount) => {
        if (discount.start_date && discount.end_date) {
            return `${format(new Date(discount.start_date), 'MMM d, yyyy')} - ${format(
                new Date(discount.end_date),
                'MMM d, yyyy',
            )}`
        }
        if (discount.start_date && !discount.end_date) {
            return `Starts ${format(new Date(discount.start_date), 'MMM d, yyyy')}`
        }
        if (!discount.start_date && discount.end_date) {
            return `Until ${format(new Date(discount.end_date), 'MMM d, yyyy')}`
        }
        return 'No date range'
    }

    const renderRows = () => {
        if (isLoading) {
            return Array.from({ length: 4 }).map((_, idx) => (
                <TableRow key={idx}>
                    <TableCell colSpan={7}>
                        <Skeleton className="h-10 w-full" />
                    </TableCell>
                </TableRow>
            ))
        }

        if (!discounts.length) {
            return (
                <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                        No discounts found
                    </TableCell>
                </TableRow>
            )
        }

        return discounts.map((discount) => (
            <TableRow key={discount.id}>
                <TableCell className="w-10">
                    <Checkbox checked={selectedIds.includes(discount.id)} onCheckedChange={() => toggleSelection(discount.id)} />
                </TableCell>
                <TableCell className="font-medium">{discount.name}</TableCell>
                <TableCell className="capitalize">{discount.discount_type}</TableCell>
                <TableCell>{formatValue(discount)}</TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        <Switch
                            checked={discount.is_active}
                            onCheckedChange={(checked) => onToggleStatus?.(discount.id, !!checked)}
                        />
                        <Badge variant={discount.is_active ? 'default' : 'secondary'}>
                            {discount.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                </TableCell>
                <TableCell>{formatDateRange(discount)}</TableCell>
                <TableCell className="text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onView?.(discount.id)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onEdit?.(discount.id)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => onDelete?.(discount.id)}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
            </TableRow>
        ))
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    <span className="text-sm text-muted-foreground">
                        {selectedIds.length} selected
                    </span>
                </div>
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!selectedIds.length}
                        onClick={() => onBulkStatus?.(selectedIds, true)}
                    >
                        Activate
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!selectedIds.length}
                        onClick={() => onBulkStatus?.(selectedIds, false)}
                    >
                        Deactivate
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        disabled={!selectedIds.length}
                        onClick={() => onBulkDelete?.(selectedIds)}
                    >
                        Delete
                    </Button>
                </div>
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10" />
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date range</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>{renderRows()}</TableBody>
                </Table>
            </div>
        </div>
    )
}

