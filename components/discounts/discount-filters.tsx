'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export function DiscountFilters({ value, onChange, onCreate }: DiscountFiltersProps) {
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
        onChange({ search: '', isActive: 'all', sortBy: 'display_order', sortDir: 'asc' })
    }

    return (
        <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[220px] space-y-2">
                <Label htmlFor="discount-search">Search</Label>
                <Input
                    id="discount-search"
                    placeholder="Search discounts"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        onChange({ ...value, search: e.target.value })
                    }}
                />
            </div>
            <div className="min-w-[180px] space-y-2">
                <Label>Status</Label>
                <Select
                    value={value.isActive === 'all' || value.isActive === undefined ? 'all' : value.isActive ? 'active' : 'inactive'}
                    onValueChange={handleStatusChange}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="min-w-[180px] space-y-2">
                <Label>Sort by</Label>
                <Select
                    value={value.sortBy ?? 'display_order'}
                    onValueChange={(val) => onChange({ ...value, sortBy: val as DiscountListFilters['sortBy'] })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="display_order">Display order</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="created_at">Created date</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="min-w-[140px] space-y-2">
                <Label>Direction</Label>
                <Select
                    value={value.sortDir ?? 'asc'}
                    onValueChange={(val) => onChange({ ...value, sortDir: val as DiscountListFilters['sortDir'] })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="asc">Ascending</SelectItem>
                        <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={handleReset}>
                    Reset
                </Button>
                {/* {onCreate && (
                    <Button onClick={onCreate}>
                        New discount
                    </Button>
                )} */}
            </div>
        </div>
    )
}

