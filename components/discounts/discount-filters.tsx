'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { DiscountListFilters } from '@/types/discount'

interface DiscountFiltersProps {
    value: DiscountListFilters
    onChange: (filters: DiscountListFilters) => void
    onCreate?: () => void
}

/** DS-CTL-03 — a tinted, borderless filter chip. Quieter than a pill control. */
const FILTER_TRIGGER =
    'h-9 w-auto gap-1.5 rounded-full border-0 bg-muted/60 px-4 text-[0.8125rem] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground'

export function DiscountFilters({ value, onChange }: DiscountFiltersProps) {
    const [search, setSearch] = useState(value.search ?? '')

    useEffect(() => {
        setSearch(value.search ?? '')
    }, [value.search])

    const handleStatusChange = (val: string) => {
        if (val === 'active') onChange({ ...value, isActive: true })
        else if (val === 'inactive') onChange({ ...value, isActive: false })
        else onChange({ ...value, isActive: 'all' })
    }

    const handleReset = () => {
        setSearch('')
        onChange({ search: '', isActive: 'all', sortBy: 'display_order', sortDir: 'asc', hideExpired: false })
    }

    const isDirty =
        !!value.search ||
        (value.isActive !== 'all' && value.isActive !== undefined) ||
        (value.sortBy ?? 'display_order') !== 'display_order' ||
        (value.sortDir ?? 'asc') !== 'asc' ||
        !!value.hideExpired

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* DS-CTL-02 — filled, borderless search */}
            <div className="relative min-w-0 flex-1 basis-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                    id="discount-search"
                    placeholder="Search discounts"
                    aria-label="Search discounts"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        onChange({ ...value, search: e.target.value })
                    }}
                    className="h-9 rounded-full border-0 bg-muted/60 pl-9 text-[0.8125rem] shadow-none focus-visible:bg-background"
                />
            </div>

            <Select
                value={
                    value.isActive === 'all' || value.isActive === undefined
                        ? 'all'
                        : value.isActive
                          ? 'active'
                          : 'inactive'
                }
                onValueChange={handleStatusChange}
            >
                <SelectTrigger className={FILTER_TRIGGER} aria-label="Filter by status">
                    <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
            </Select>

            <Select
                value={value.sortBy ?? 'display_order'}
                onValueChange={(val) => onChange({ ...value, sortBy: val as DiscountListFilters['sortBy'] })}
            >
                <SelectTrigger className={FILTER_TRIGGER} aria-label="Sort by">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="display_order">Display order</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="created_at">Created date</SelectItem>
                </SelectContent>
            </Select>

            <Select
                value={value.sortDir ?? 'asc'}
                onValueChange={(val) => onChange({ ...value, sortDir: val as DiscountListFilters['sortDir'] })}
            >
                <SelectTrigger className={FILTER_TRIGGER} aria-label="Sort direction">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
            </Select>

            {/* Bare checkbox on the panel ground, matching the table's
                "Select all" — no pill, so it reads as a toggle rather than
                as another filter chip. */}
            <div className="flex h-9 shrink-0 items-center gap-2.5 px-1">
                <Checkbox
                    id="discount-hide-expired"
                    checked={!!value.hideExpired}
                    onCheckedChange={(checked) => onChange({ ...value, hideExpired: !!checked })}
                />
                <Label
                    htmlFor="discount-hide-expired"
                    className="cursor-pointer text-[0.8125rem] font-normal text-muted-foreground"
                >
                    Hide expired
                </Label>
            </div>

            {isDirty && (
                <Button
                    variant="ghost"
                    onClick={handleReset}
                    className="h-9 shrink-0 gap-1.5 rounded-full px-4 text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                    Reset
                </Button>
            )}
        </div>
    )
}
