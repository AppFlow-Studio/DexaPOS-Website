'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Discount, isDiscountExpired } from '@/types/discount'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
    discountStatus,
    discountStatusLabel,
    discountStatusStyle,
} from '@/lib/constants/discount-status'
import { Eye, Globe, MapPin, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react'

interface DiscountTableProps {
    discounts: Discount[]
    isLoading?: boolean
    locationNameById?: Record<string, string>
    /** Hide the global-vs-location Scope column for single-location accounts. */
    isSingleLocation?: boolean
    onToggleStatus?: (id: string, isActive: boolean) => void
    onBulkStatus?: (ids: string[], isActive: boolean) => void
    onBulkDelete?: (ids: string[], mode?: 'soft' | 'hard') => void
    onDelete?: (id: string, mode?: 'soft' | 'hard') => void
    onView?: (id: string) => void
    onEdit?: (id: string) => void
    onCreate?: () => void
    showMobileReset?: boolean
    onResetFilters?: () => void
}

/** DS-CTL-01 — the canonical pill control. */
const PILL_CONTROL = 'h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm'

/**
 * What the confirm dialog is currently asking about: a single row, or the
 * current bulk selection. `null` keeps the dialog closed.
 */
type PendingDelete =
    | { kind: 'single'; id: string; name: string }
    | { kind: 'bulk'; ids: string[] }

export function DiscountTable({
    discounts,
    isLoading,
    locationNameById,
    isSingleLocation = false,
    onToggleStatus,
    onBulkStatus,
    onBulkDelete,
    onDelete,
    onView,
    onEdit,
    onCreate,
    showMobileReset = false,
    onResetFilters,
}: DiscountTableProps) {
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
    const [deleteMode, setDeleteMode] = useState<'soft' | 'hard'>('soft')

    // Drop selections whose rows have left the list (filtered out or deleted),
    // otherwise a bulk action fires against ids the user can no longer see.
    useEffect(() => {
        setSelectedIds((prev) => {
            const visible = new Set(discounts.map((d) => d.id))
            const next = prev.filter((id) => visible.has(id))
            return next.length === prev.length ? prev : next
        })
    }, [discounts])

    const allSelected = useMemo(
        () => discounts.length > 0 && selectedIds.length === discounts.length,
        [discounts.length, selectedIds.length],
    )

    const columnCount = isSingleLocation ? 7 : 8

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

    /** Every delete routes through here, so nothing is removed un-confirmed. */
    const requestDelete = (target: PendingDelete) => {
        setDeleteMode('soft')
        setPendingDelete(target)
    }

    const confirmDelete = () => {
        if (!pendingDelete) return
        if (pendingDelete.kind === 'single') {
            onDelete?.(pendingDelete.id, deleteMode)
        } else {
            onBulkDelete?.(pendingDelete.ids, deleteMode)
            setSelectedIds([])
        }
        setPendingDelete(null)
    }

    const formatValue = (discount: Discount) => {
        if (discount.discount_type === 'percentage') return `${discount.discount_value}%`
        return `$${discount.discount_value}`
    }

    const formatDateRange = (discount: Discount) => {
        if (discount.start_date && discount.end_date) {
            return `${format(new Date(discount.start_date), 'MMM d, yyyy')} – ${format(
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

    /** DS-CTL-09 — soft tint + dot, colours from the constants module (D-11). */
    const renderStatusBadge = (discount: Discount) => {
        const status = discountStatus(discount)
        const style = discountStatusStyle(status)
        return (
            <span
                className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    style.bg,
                    style.text,
                )}
            >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', style.dot)} />
                {discountStatusLabel(status)}
            </span>
        )
    }

    const renderScope = (discount: Discount) => {
        if (!discount.location_id) {
            return (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    Global
                </span>
            )
        }
        const name = locationNameById?.[discount.location_id]
        return (
            <span className="inline-flex max-w-[160px] items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{name ?? 'Location'}</span>
            </span>
        )
    }

    const renderRows = () => {
        if (isLoading) {
            return Array.from({ length: 4 }).map((_, idx) => (
                <TableRow key={idx} className="border-b border-border/60 last:border-0">
                    <TableCell colSpan={columnCount} className="py-3">
                        <Skeleton className="h-10 w-full" />
                    </TableCell>
                </TableRow>
            ))
        }

        if (!discounts.length) {
            return (
                <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columnCount} className="h-40 text-center">
                        <p className="text-sm font-medium">No discounts found</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Create a discount, or adjust your filters to widen the search.
                        </p>
                        {onCreate && (
                            <Button
                                onClick={onCreate}
                                variant="outline"
                                className={cn(PILL_CONTROL, 'mt-4 gap-1.5')}
                            >
                                <Plus className="h-4 w-4" />
                                New discount
                            </Button>
                        )}
                    </TableCell>
                </TableRow>
            )
        }

        return discounts.map((discount) => {
            const expired = isDiscountExpired(discount)
            return (
                <TableRow
                    key={discount.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                >
                    <TableCell className="w-10 py-3">
                        <Checkbox
                            checked={selectedIds.includes(discount.id)}
                            onCheckedChange={() => toggleSelection(discount.id)}
                            aria-label={`Select ${discount.name}`}
                        />
                    </TableCell>
                    <TableCell className="py-3 text-sm font-medium">
                        <button
                            type="button"
                            onClick={() => onView?.(discount.id)}
                            className="max-w-[220px] truncate text-left transition-colors hover:text-[#0C4FD1] dark:hover:text-[#6CA0FF]"
                        >
                            {discount.name}
                        </button>
                    </TableCell>
                    <TableCell className="hidden py-3 text-sm capitalize text-muted-foreground sm:table-cell">
                        {discount.discount_type.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="hidden py-3 text-sm tabular-nums sm:table-cell">
                        {formatValue(discount)}
                    </TableCell>
                    {!isSingleLocation && (
                        <TableCell className="hidden py-3 md:table-cell">{renderScope(discount)}</TableCell>
                    )}
                    <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={discount.is_active}
                                onCheckedChange={(checked) => onToggleStatus?.(discount.id, !!checked)}
                                aria-label={`Toggle ${discount.name}`}
                            />
                            {renderStatusBadge(discount)}
                        </div>
                    </TableCell>
                    <TableCell className="hidden py-3 md:table-cell">
                        <span
                            className={cn(
                                'text-sm tabular-nums text-muted-foreground',
                                expired && 'line-through',
                            )}
                        >
                            {formatDateRange(discount)}
                        </span>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Actions for {discount.name}</span>
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
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() =>
                                        requestDelete({
                                            kind: 'single',
                                            id: discount.id,
                                            name: discount.name,
                                        })
                                    }
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                </TableRow>
            )
        })
    }

    const hasSelection = selectedIds.length > 0

    return (
        <div className="min-w-0 space-y-3">
            {/* Bulk action bar — an inset well, so it reads as one tinted strip
                rather than a competing box beside the panel edge. */}
            <div
                className={cn(
                    'flex flex-wrap items-center justify-between gap-3 rounded-2xl border-0 px-1 py-2.5 shadow-none transition-colors sm:px-4',
                    hasSelection ? 'bg-muted/60' : 'bg-transparent',
                )}
            >
                <div className="flex min-w-0 items-center gap-2.5">
                    <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        disabled={!discounts.length}
                        aria-label="Select all discounts"
                    />
                    <span className="text-[0.8125rem] text-muted-foreground tabular-nums">
                        {hasSelection ? `${selectedIds.length} selected` : 'Select all'}
                    </span>
                </div>

                {hasSelection && (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            className={PILL_CONTROL}
                            onClick={() => onBulkStatus?.(selectedIds, true)}
                        >
                            Activate
                        </Button>
                        <Button
                            variant="outline"
                            className={PILL_CONTROL}
                            onClick={() => onBulkStatus?.(selectedIds, false)}
                        >
                            Deactivate
                        </Button>
                        <Button
                            variant="outline"
                            className={cn(
                                PILL_CONTROL,
                                'text-destructive hover:bg-destructive/10 hover:text-destructive',
                            )}
                            onClick={() => requestDelete({ kind: 'bulk', ids: selectedIds })}
                        >
                            Delete
                        </Button>
                    </div>
                )}
            </div>

            {showMobileReset && onResetFilters && (
                <div className="flex px-1 sm:hidden">
                    <Button
                        variant="ghost"
                        onClick={onResetFilters}
                        className="h-8 gap-2.5 rounded-full px-0 text-[0.8125rem] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                        Reset
                    </Button>
                </div>
            )}

            {/* Delete confirmation — shared by the row menu and the bulk bar, so
                no discount is ever removed without an explicit confirm. */}
            <AlertDialog
                open={!!pendingDelete}
                onOpenChange={(open) => {
                    if (!open) setPendingDelete(null)
                }}
            >
                <AlertDialogContent
                    className={cn(
                        'rounded-3xl sm:rounded-3xl duration-300 ease-out',
                        // Rise on open (from below), sink on close (to below).
                        //
                        // Two things make this fiddly:
                        //
                        // 1. The animation utilities all write the same custom
                        //    properties, and equal-specificity rules resolve by
                        //    stylesheet order — which this class list does not
                        //    control. Plain `[--tw-…]` classes lose outright,
                        //    because Tailwind emits every `data-[state=…]`
                        //    variant (including the primitive's) in a later
                        //    block. Matching the variant form is what puts these
                        //    on equal footing.
                        //
                        // 2. `enter` is a `from` keyframe and `exit` is a `to`
                        //    keyframe, and both overwrite `transform` wholesale —
                        //    which drops the `-translate-[50%]` that centres the
                        //    panel. So the centring is folded into the values
                        //    here; otherwise the dialog jumps half its own size
                        //    as the animation takes over. Positive Y is downward,
                        //    so `-50% + 2rem` sits just below centre at both ends.
                        // `**:` doubles the selector (`.cls.cls`), lifting these
                        // above the primitive's single-class rules regardless of
                        // which Tailwind emits last.
                        '[&&]:data-[state=open]:[--tw-enter-scale:1]',
                        '[&&]:data-[state=closed]:[--tw-exit-scale:1]',
                        '[&&]:data-[state=open]:[--tw-enter-translate-x:-50%]',
                        '[&&]:data-[state=closed]:[--tw-exit-translate-x:-50%]',
                        '[&&]:data-[state=open]:[--tw-enter-translate-y:calc(-50%+2rem)]',
                        '[&&]:data-[state=closed]:[--tw-exit-translate-y:calc(-50%+2rem)]'
                    )}
                >
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pendingDelete?.kind === 'bulk'
                                ? `Delete ${pendingDelete.ids.length} discount${
                                      pendingDelete.ids.length === 1 ? '' : 's'
                                  }?`
                                : `Delete ${pendingDelete?.name ?? 'discount'}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Deleting may impact active orders. Choose soft delete to simply
                            disable {pendingDelete?.kind === 'bulk' ? 'them' : 'it'}, or hard
                            delete to remove{' '}
                            {pendingDelete?.kind === 'bulk' ? 'them' : 'it'} entirely.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <RadioGroup
                        value={deleteMode}
                        onValueChange={(val) => setDeleteMode(val as 'soft' | 'hard')}
                        className="gap-0 rounded-3xl border-0 bg-muted/60 p-1 shadow-none"
                    >
                        <Label
                            htmlFor="row-delete-soft"
                            className="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-background/60"
                        >
                            <RadioGroupItem value="soft" id="row-delete-soft" className="mt-0.5" />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">Soft delete</span>
                                <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
                                    Sets the discount inactive. It stays on past orders and can be
                                    re-enabled later.
                                </span>
                            </span>
                        </Label>
                        <Label
                            htmlFor="row-delete-hard"
                            className="flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-background/60"
                        >
                            <RadioGroupItem value="hard" id="row-delete-hard" className="mt-0.5" />
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">Hard delete</span>
                                <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground">
                                    Removes the record permanently. This cannot be undone.
                                </span>
                            </span>
                        </Label>
                    </RadioGroup>

                    <AlertDialogFooter>
                        <AlertDialogCancel className="h-9 rounded-full px-4 text-[0.8125rem] font-medium">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className={cn(
                                PILL_CONTROL,
                                'bg-destructive text-white hover:bg-destructive/90'
                            )}
                        >
                            Confirm
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* §5 — hairlines, no frame. */}
            <div className="-mx-2 overflow-x-auto px-2">
                <Table>
                    <TableHeader>
                        <TableRow className="border-b border-border/60 hover:bg-transparent">
                            <TableHead className="h-auto w-10 py-2.5" />
                            <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">
                                Name
                            </TableHead>
                            <TableHead className="hidden h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground sm:table-cell">
                                Type
                            </TableHead>
                            <TableHead className="hidden h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground sm:table-cell">
                                Value
                            </TableHead>
                            {!isSingleLocation && (
                                <TableHead className="hidden h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground md:table-cell">
                                    Scope
                                </TableHead>
                            )}
                            <TableHead className="h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground">
                                Status
                            </TableHead>
                            <TableHead className="hidden h-auto py-2.5 text-[0.8125rem] font-normal text-muted-foreground md:table-cell">
                                Date range
                            </TableHead>
                            <TableHead className="h-auto py-2.5 text-right text-[0.8125rem] font-normal text-muted-foreground">
                                Actions
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>{renderRows()}</TableBody>
                </Table>
            </div>
        </div>
    )
}
