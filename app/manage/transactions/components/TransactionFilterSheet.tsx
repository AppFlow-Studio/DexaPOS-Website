'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DateRangePicker, DatePreset } from '@/components/dashboard/orders/DateRangePicker'
import { Filter, ChevronDown, X } from 'lucide-react'
import {
    getPlatformLocations,
    getPlatformMerchants,
    getPlatformStaff,
    PlatformLocation,
    PlatformMerchant,
    PlatformStaff,
} from '@/app/manage/actions/hq-platform/transactions'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/lib/hooks/useDebounce'

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ORDER_STATUSES = [
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'ready', label: 'Ready' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'void', label: 'Void' },
]

const PAYMENT_STATUSES = [
    { value: 'captured', label: 'Captured' },
    { value: 'authorized', label: 'Authorized' },
    { value: 'refunded', label: 'Refunded' },
    { value: 'partially_refunded', label: 'Partial Refund' },
    { value: 'declined', label: 'Declined' },
    { value: 'void', label: 'Void' },
]

const PAYMENT_METHODS = [
    { value: 'cash', label: 'Cash' },
    { value: 'card', label: 'Card' },
    { value: 'card_spinapi', label: 'Card (SpinAPI)' },
    { value: 'card_dvpaylite', label: 'Card (DVPay)' },
    { value: 'gift_card', label: 'Gift Card' },
    { value: 'house_account', label: 'House Account' },
]

const CARD_TYPES = [
    { value: 'visa', label: 'Visa' },
    { value: 'mastercard', label: 'Mastercard' },
    { value: 'amex', label: 'Amex' },
    { value: 'discover', label: 'Discover' },
    { value: 'other', label: 'Other' },
]

// â”€â”€â”€ Helper: parse comma-separated URL param â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseList(val: string | null): string[] {
    if (!val) return []
    return val.split(',').filter(Boolean)
}

// â”€â”€â”€ Multi-select dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface MultiSelectProps {
    label: string
    options: { value: string; label: string }[]
    selected: string[]
    onChange: (values: string[]) => void
    disabled?: boolean
    placeholder?: string
}

function MultiSelect({ label, options, selected, onChange, disabled, placeholder }: MultiSelectProps) {
    const toggle = (val: string) => {
        onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
    }
    const displayLabel = selected.length === 0
        ? (placeholder ?? `All ${label}`)
        : selected.length === 1
            ? options.find(o => o.value === selected[0])?.label ?? selected[0]
            : `${selected.length} selected`

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <Button variant="outline" className="w-full justify-between font-normal" size="sm">
                    <span className="truncate">{displayLabel}</span>
                    {selected.length > 0
                        ? <Badge className="ml-1 h-4 px-1 text-[10px]">{selected.length}</Badge>
                        : <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 z-[200]">
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {options.map(opt => (
                    <DropdownMenuCheckboxItem
                        key={opt.value}
                        checked={selected.includes(opt.value)}
                        onCheckedChange={() => toggle(opt.value)}
                    >
                        {opt.label}
                    </DropdownMenuCheckboxItem>
                ))}
                {selected.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            checked={false}
                            onCheckedChange={() => onChange([])}
                            className="text-muted-foreground text-xs"
                        >
                            Clear selection
                        </DropdownMenuCheckboxItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

interface SearchableSingleSelectProps {
    label: string
    options: { value: string; label: string }[]
    selected: string | null
    onChange: (value: string | null) => void
    disabled?: boolean
    placeholder?: string
    searchPlaceholder?: string
}

function SearchableSingleSelect({
    label,
    options,
    selected,
    onChange,
    disabled,
    placeholder,
    searchPlaceholder,
}: SearchableSingleSelectProps) {
    const [search, setSearch] = useState('')
    const selectedLabel = selected
        ? options.find((option) => option.value === selected)?.label
        : null

    const filteredOptions = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return options
        return options.filter((option) => option.label.toLowerCase().includes(query))
    }, [options, search])

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <Button variant="outline" className="w-full justify-between font-normal" size="sm">
                    <span className="truncate">{selectedLabel || placeholder || `All ${label}`}</span>
                    <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 z-[200]">
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                <div className="p-2">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`}
                        onKeyDown={(event) => event.stopPropagation()}
                    />
                </div>
                <DropdownMenuSeparator />
                {selected && (
                    <DropdownMenuItem onSelect={() => onChange(null)}>
                        All {label}
                    </DropdownMenuItem>
                )}
                {filteredOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No results</div>
                ) : (
                    filteredOptions.map((option) => (
                        <DropdownMenuItem
                            key={option.value}
                            onSelect={() => onChange(option.value)}
                            className={cn(selected === option.value && 'bg-accent')}
                        >
                            {option.label}
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface TransactionFilterSheetProps {
    searchParams: ReadonlyURLSearchParams
}

export function TransactionFilterSheet({ searchParams }: TransactionFilterSheetProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [, startTransition] = useTransition()

    // Remote data for dropdowns
    const [merchants, setMerchants] = useState<PlatformMerchant[]>([])
    const [locations, setLocations] = useState<PlatformLocation[]>([])
    const [staffOptions, setStaffOptions] = useState<PlatformStaff[]>([])

    // Local filter state (mirrors URL params)
    const [selectedMerchants, setSelectedMerchants] = useState<string[]>(() => parseList(searchParams.get('merchants')))
    const [selectedLocations, setSelectedLocations] = useState<string[]>(() => parseList(searchParams.get('locations')))
    const [orderStatuses, setOrderStatuses] = useState<string[]>(() => parseList(searchParams.get('orderStatus')))
    const [paymentStatuses, setPaymentStatuses] = useState<string[]>(() => parseList(searchParams.get('paymentStatus')))
    const [paymentMethods, setPaymentMethods] = useState<string[]>(() => parseList(searchParams.get('method')))
    const [cardTypes, setCardTypes] = useState<string[]>(() => parseList(searchParams.get('cardType')))
    const [selectedStaffId, setSelectedStaffId] = useState<string | null>(() => searchParams.get('staffId'))
    const [minAmount, setMinAmount] = useState(searchParams.get('minAmount') ?? '')
    const [maxAmount, setMaxAmount] = useState(searchParams.get('maxAmount') ?? '')
    const [datePreset, setDatePreset] = useState<DatePreset>((searchParams.get('datePreset') as DatePreset) ?? 'custom')
    const [dateFrom, setDateFrom] = useState<Date | null>(() => {
        const v = searchParams.get('dateFrom')
        return v ? new Date(v) : null
    })
    const [dateTo, setDateTo] = useState<Date | null>(() => {
        const v = searchParams.get('dateTo')
        return v ? new Date(v) : null
    })

    // Re-sync local state from URL when sheet is opened
    // (so filter sheet always reflects currently-applied filters)
    useEffect(() => {
        if (!open) return
        setSelectedMerchants(parseList(searchParams.get('merchants')))
        setSelectedLocations(parseList(searchParams.get('locations')))
        setOrderStatuses(parseList(searchParams.get('orderStatus')))
        setPaymentStatuses(parseList(searchParams.get('paymentStatus')))
        setPaymentMethods(parseList(searchParams.get('method')))
        setCardTypes(parseList(searchParams.get('cardType')))
        setSelectedStaffId(searchParams.get('staffId'))
        setMinAmount(searchParams.get('minAmount') ?? '')
        setMaxAmount(searchParams.get('maxAmount') ?? '')
        setDatePreset((searchParams.get('datePreset') as DatePreset) ?? 'custom')
        const dfVal = searchParams.get('dateFrom')
        const dtVal = searchParams.get('dateTo')
        setDateFrom(dfVal ? new Date(dfVal) : null)
        setDateTo(dtVal ? new Date(dtVal) : null)
    }, [open])

    // Load merchants on open
    useEffect(() => {
        if (!open || merchants.length > 0) return
        getPlatformMerchants().then(setMerchants)
    }, [open])

    // Load locations when merchants selection changes
    useEffect(() => {
        if (selectedMerchants.length === 0) {
            setLocations([])
            return
        }
        getPlatformLocations(selectedMerchants).then(setLocations)
    }, [selectedMerchants])

    useEffect(() => {
        if (!open) return
        getPlatformStaff(
            selectedMerchants.length > 0 ? selectedMerchants : undefined,
            selectedLocations.length > 0 ? selectedLocations : undefined
        ).then(setStaffOptions)
    }, [open, selectedMerchants, selectedLocations])

    useEffect(() => {
        if (!selectedStaffId) return
        if (staffOptions.some((staff) => staff.id === selectedStaffId)) return
        setSelectedStaffId(null)
    }, [staffOptions, selectedStaffId])

    // â”€â”€ URL sync helper â”€â”€
    const updateParams = (
        updates: Record<string, string | null>,
        options?: { closeSheet?: boolean; resetPage?: boolean }
    ) => {
        const params = new URLSearchParams(searchParams.toString())
        const previous = params.toString()

        Object.entries(updates).forEach(([k, v]) => {
            if (v === null || v === '') params.delete(k)
            else params.set(k, v)
        })

        if (options?.resetPage ?? true) {
            // Always reset to page 1 when filters change
            params.delete('page')
        }

        const next = params.toString()
        if (options?.closeSheet) {
            setOpen(false)
        }
        if (next === previous) return

        startTransition(() => router.push(`?${next}`))
    }

    const buildFilterUpdates = useMemo<Record<string, string | null>>(() => ({
            merchants: selectedMerchants.join(',') || null,
            locations: selectedLocations.join(',') || null,
            orderStatus: orderStatuses.join(',') || null,
            paymentStatus: paymentStatuses.join(',') || null,
            method: paymentMethods.join(',') || null,
            cardType: cardTypes.join(',') || null,
            staffId: selectedStaffId || null,
            minAmount: minAmount || null,
            maxAmount: maxAmount || null,
            dateFrom: dateFrom ? dateFrom.toISOString().slice(0, 10) : null,
            dateTo: dateTo ? dateTo.toISOString().slice(0, 10) : null,
            datePreset: dateFrom || dateTo ? datePreset : null,
        }), [
            selectedMerchants,
            selectedLocations,
            orderStatuses,
            paymentStatuses,
            paymentMethods,
            cardTypes,
            selectedStaffId,
            minAmount,
            maxAmount,
            dateFrom,
            dateTo,
            datePreset,
        ])

    const debouncedFilterUpdates = useDebounce(buildFilterUpdates, 300)
    const shouldSkipNextAutoApply = useRef(true)

    useEffect(() => {
        if (!open) return
        if (shouldSkipNextAutoApply.current) {
            shouldSkipNextAutoApply.current = false
            return
        }
        updateParams(debouncedFilterUpdates, { closeSheet: false, resetPage: true })
    }, [debouncedFilterUpdates, open])

    useEffect(() => {
        if (open) {
            shouldSkipNextAutoApply.current = true
        }
    }, [open])

    // â”€â”€ Optional immediate apply button â”€â”€
    const applyFilters = () => {
        updateParams(buildFilterUpdates, { closeSheet: true, resetPage: true })
    }

    // â”€â”€ Clear all â”€â”€
    const clearAll = () => {
        setSelectedMerchants([])
        setSelectedLocations([])
        setOrderStatuses([])
        setPaymentStatuses([])
        setPaymentMethods([])
        setCardTypes([])
        setSelectedStaffId(null)
        setMinAmount('')
        setMaxAmount('')
        setDatePreset('custom')
        setDateFrom(null)
        setDateTo(null)
        startTransition(() => router.push('?'))
        setOpen(false)
    }

    // â”€â”€ Active filter count (for badge on trigger button) â”€â”€
    const activeCount = [
        selectedMerchants.length > 0,
        selectedLocations.length > 0,
        orderStatuses.length > 0,
        paymentStatuses.length > 0,
        paymentMethods.length > 0,
        cardTypes.length > 0,
        !!selectedStaffId,
        !!minAmount || !!maxAmount,
        !!dateFrom || !!dateTo,
    ].filter(Boolean).length

    return (
        <>
            {/* Trigger button â€” not using SheetTrigger asChild to avoid focus/event issues */}
            <Button variant="outline" className="relative" onClick={() => setOpen(true)}>
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {activeCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                        {activeCount}
                    </Badge>
                )}
            </Button>

            <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" className="w-[420px] max-w-[92vw] overflow-hidden">
                <div className="flex h-full flex-col">
                <SheetHeader className="pr-14">
                    <div className="flex items-center justify-between gap-2">
                        <SheetTitle>Filter Transactions</SheetTitle>
                    </div>
                    {activeCount > 0 && (
                        <div className="pt-1">
                            <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground h-7 px-2">
                                <X className="h-3 w-3 mr-1" />
                                Clear all
                            </Button>
                        </div>
                    )}
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="pt-2 space-y-6">

                    {/* Date Range */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Date Range</Label>
                        <DateRangePicker
                            dateFrom={dateFrom}
                            dateTo={dateTo}
                            preset={datePreset}
                            onDateRangeChange={(from, to) => { setDateFrom(from); setDateTo(to) }}
                            onPresetChange={setDatePreset}
                            initializeWhenEmpty={false}
                        />
                    </div>

                    <Separator />

                    {/* Merchant */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Merchant</Label>
                        <MultiSelect
                            label="Merchants"
                            options={merchants.map(m => ({ value: m.id, label: m.name }))}
                            selected={selectedMerchants}
                            onChange={setSelectedMerchants}
                            placeholder="All Merchants"
                        />
                    </div>

                    {/* Location */}
                    <div className="space-y-2">
                        <Label className={cn('text-sm font-semibold', selectedMerchants.length === 0 && 'text-muted-foreground')}>
                            Location
                        </Label>
                        <MultiSelect
                            label="Locations"
                            options={locations.map(l => ({ value: l.id, label: l.name }))}
                            selected={selectedLocations}
                            onChange={setSelectedLocations}
                            disabled={selectedMerchants.length === 0}
                            placeholder={selectedMerchants.length === 0 ? 'Select merchant first' : 'All Locations'}
                        />
                    </div>

                    <Separator />

                    {/* Payment Method */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Payment Method</Label>
                        <MultiSelect
                            label="Payment Methods"
                            options={PAYMENT_METHODS}
                            selected={paymentMethods}
                            onChange={setPaymentMethods}
                            placeholder="All Methods"
                        />
                    </div>

                    {/* Card Type */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Card Type</Label>
                        <MultiSelect
                            label="Card Types"
                            options={CARD_TYPES}
                            selected={cardTypes}
                            onChange={setCardTypes}
                            placeholder="All Card Types"
                        />
                    </div>

                    {/* Staff */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Staff</Label>
                        <SearchableSingleSelect
                            label="Staff"
                            options={staffOptions.map((staff) => ({ value: staff.id, label: staff.name }))}
                            selected={selectedStaffId}
                            onChange={setSelectedStaffId}
                            placeholder="All Staff"
                            searchPlaceholder="Search staff..."
                        />
                    </div>

                    <Separator />

                    {/* Order Status */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Order Status</Label>
                        <MultiSelect
                            label="Order Statuses"
                            options={ORDER_STATUSES}
                            selected={orderStatuses}
                            onChange={setOrderStatuses}
                            placeholder="All Statuses"
                        />
                    </div>

                    {/* Payment Status */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Payment Status</Label>
                        <MultiSelect
                            label="Payment Statuses"
                            options={PAYMENT_STATUSES}
                            selected={paymentStatuses}
                            onChange={setPaymentStatuses}
                            placeholder="All Statuses"
                        />
                    </div>

                    <Separator />

                    {/* Amount Range */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Amount Range</Label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground">$</span>
                                <Input
                                    type="number"
                                    placeholder="Min"
                                    value={minAmount}
                                    onChange={e => setMinAmount(e.target.value)}
                                    className="pl-6"
                                    min={0}
                                />
                            </div>
                            <span className="text-muted-foreground text-sm">~</span>
                            <div className="relative flex-1">
                                <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground">$</span>
                                <Input
                                    type="number"
                                    placeholder="Max"
                                    value={maxAmount}
                                    onChange={e => setMaxAmount(e.target.value)}
                                    className="pl-6"
                                    min={0}
                                />
                            </div>
                        </div>
                    </div>

                </div>
                </div>

                {/* Footer actions */}
                <div className="border-t bg-background p-4 flex gap-2">
                    <Button onClick={applyFilters} className="flex-1">
                        Apply Filters
                    </Button>
                    <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
                        Cancel
                    </Button>
                </div>
                </div>
            </SheetContent>
            </Sheet>
        </>
    )
}
