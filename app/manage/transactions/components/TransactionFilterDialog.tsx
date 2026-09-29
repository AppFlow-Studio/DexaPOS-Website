'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
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

// ─── Constants ──────────────────────────────────────────────────────────────

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

/*
 * The field material inside this dialog: muted, borderless, pill-shaped
 * (UI-DESIGN-SYSTEM §4.2). The dropdown triggers are Buttons, which default to
 * an outline, so they spell it out. Literal in this .tsx on purpose (C7).
 */
const FIELD_TRIGGER =
    'h-9 w-full justify-between border-0 bg-muted/60 px-4 text-[0.8125rem] font-normal shadow-none hover:bg-muted dark:bg-muted/60'

// ─── Helper: parse comma-separated URL param ────────────────────────────────
function parseList(val: string | null): string[] {
    if (!val) return []
    return val.split(',').filter(Boolean)
}

// ─── Multi-select dropdown ──────────────────────────────────────────────────
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
                <Button variant="ghost" className={cn(FIELD_TRIGGER, selected.length === 0 && 'text-muted-foreground')}>
                    <span className="truncate">{displayLabel}</span>
                    <ChevronDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
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
                <Button variant="ghost" className={cn(FIELD_TRIGGER, !selectedLabel && 'text-muted-foreground')}>
                    <span className="truncate">{selectedLabel || placeholder || `All ${label}`}</span>
                    <ChevronDown className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 z-[200]">
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                <div className="p-2">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={searchPlaceholder || `Search ${label.toLowerCase()}...`}
                        aria-label={`Search ${label.toLowerCase()}`}
                        className="h-9 text-[0.8125rem]"
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
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No {label.toLowerCase()} match “{search.trim()}”.</div>
                ) : (
                    filteredOptions.map((option) => (
                        <DropdownMenuItem
                            key={option.value}
                            onSelect={() => onChange(option.value)}
                            className={cn(selected === option.value && 'bg-accent font-medium')}
                        >
                            {option.label}
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface TransactionFilterDialogProps {
    searchParams: ReadonlyURLSearchParams
}

/**
 * The ledger's filter panel: a trigger chip and a centred dialog
 * (UI-DESIGN-SYSTEM §12 — panels are centred pop-ups, never side sheets). It
 * fills the screen below `sm` because it is a form the user works through
 * (§13.1). Filters apply as they change; "Apply" just applies at once and
 * closes.
 */
export function TransactionFilterDialog({ searchParams }: TransactionFilterDialogProps) {
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

    // Re-sync local state from URL when the dialog is opened
    // (so the panel always reflects currently-applied filters)
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

    // ── URL sync helper ──
    const updateParams = (
        updates: Record<string, string | null>,
        options?: { closeDialog?: boolean; resetPage?: boolean }
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
        if (options?.closeDialog) {
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
        updateParams(debouncedFilterUpdates, { closeDialog: false, resetPage: true })
    }, [debouncedFilterUpdates, open])

    useEffect(() => {
        if (open) {
            shouldSkipNextAutoApply.current = true
        }
    }, [open])

    // ── Immediate apply ──
    const applyFilters = () => {
        updateParams(buildFilterUpdates, { closeDialog: true, resetPage: true })
    }

    // ── Clear all ──
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

    // ── Active filter count (shown on the trigger) ──
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
            {/* Filter chip (§4.3): tinted and borderless. An applied filter reads
                by weight and its count, not by a coloured dot. */}
            <Button
                variant="ghost"
                className={cn(
                    'h-9 shrink-0 gap-2 border-0 bg-muted/60 px-4 text-[0.8125rem] shadow-none hover:bg-muted hover:text-foreground',
                    activeCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
                onClick={() => setOpen(true)}
            >
                <Filter className="h-4 w-4" />
                Filters
                {activeCount > 0 && (
                    <span className="tabular-nums">
                        ({activeCount})
                        <span className="sr-only"> active</span>
                    </span>
                )}
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                {/* The dialog clips; only the body scrolls (§12 overlay scroll
                    structure). Full screen below `sm` (§13.1). */}
                <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-3xl">
                    <DialogHeader className="shrink-0 px-6 pb-2 pr-14 pt-6 text-left">
                        <DialogTitle>Filter transactions</DialogTitle>
                        <DialogDescription>Changes apply as you make them.</DialogDescription>
                        {activeCount > 0 && (
                            <div className="pt-1">
                                <Button variant="ghost" size="sm" onClick={clearAll} className="-ml-2 h-8 px-3 text-muted-foreground">
                                    <X className="mr-1 h-3 w-3" />
                                    Clear all
                                </Button>
                            </div>
                        )}
                    </DialogHeader>

                    {/* Groups are separated by spacing, not rules (§5.5). */}
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-4">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Date range</Label>
                            <DateRangePicker
                                dateFrom={dateFrom}
                                dateTo={dateTo}
                                preset={datePreset}
                                onDateRangeChange={(from, to) => { setDateFrom(from); setDateTo(to) }}
                                onPresetChange={setDatePreset}
                                initializeWhenEmpty={false}
                                className="w-full"
                                triggerClassName="h-9 w-full justify-start border-0 bg-muted/60 px-4 text-[0.8125rem] font-normal shadow-none hover:bg-muted dark:bg-muted/60"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Merchant</Label>
                                <MultiSelect
                                    label="Merchants"
                                    options={merchants.map(m => ({ value: m.id, label: m.name }))}
                                    selected={selectedMerchants}
                                    onChange={setSelectedMerchants}
                                    placeholder="All merchants"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className={cn('text-sm font-medium', selectedMerchants.length === 0 && 'text-muted-foreground')}>
                                    Location
                                </Label>
                                <MultiSelect
                                    label="Locations"
                                    options={locations.map(l => ({ value: l.id, label: l.name }))}
                                    selected={selectedLocations}
                                    onChange={setSelectedLocations}
                                    disabled={selectedMerchants.length === 0}
                                    placeholder={selectedMerchants.length === 0 ? 'Select a merchant first' : 'All locations'}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Payment method</Label>
                                <MultiSelect
                                    label="Payment Methods"
                                    options={PAYMENT_METHODS}
                                    selected={paymentMethods}
                                    onChange={setPaymentMethods}
                                    placeholder="All methods"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Card type</Label>
                                <MultiSelect
                                    label="Card Types"
                                    options={CARD_TYPES}
                                    selected={cardTypes}
                                    onChange={setCardTypes}
                                    placeholder="All card types"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">Staff</Label>
                                <SearchableSingleSelect
                                    label="Staff"
                                    options={staffOptions.map((staff) => ({ value: staff.id, label: staff.name }))}
                                    selected={selectedStaffId}
                                    onChange={setSelectedStaffId}
                                    placeholder="All staff"
                                    searchPlaceholder="Search staff..."
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Status</Label>
                            <MultiSelect
                                label="Payment Statuses"
                                options={PAYMENT_STATUSES}
                                selected={paymentStatuses}
                                onChange={setPaymentStatuses}
                                placeholder="All statuses"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">Amount range</Label>
                            <div className="flex items-center gap-2">
                                <div className="relative min-w-0 flex-1">
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[0.8125rem] text-muted-foreground">$</span>
                                    <Input
                                        type="number"
                                        aria-label="Minimum amount"
                                        placeholder="Min"
                                        value={minAmount}
                                        onChange={e => setMinAmount(e.target.value)}
                                        className="h-9 pl-7 text-[0.8125rem] tabular-nums"
                                        min={0}
                                    />
                                </div>
                                <span className="text-sm text-muted-foreground">to</span>
                                <div className="relative min-w-0 flex-1">
                                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[0.8125rem] text-muted-foreground">$</span>
                                    <Input
                                        type="number"
                                        aria-label="Maximum amount"
                                        placeholder="Max"
                                        value={maxAmount}
                                        onChange={e => setMaxAmount(e.target.value)}
                                        className="h-9 pl-7 text-[0.8125rem] tabular-nums"
                                        min={0}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* No rule above the footer: it is a fixed flex sibling of the
                        scroll area, so it needs no seam (§5.5, §12). */}
                    <DialogFooter className="shrink-0 flex-row gap-2 px-6 pb-6 pt-4">
                        <Button variant="outline" onClick={() => setOpen(false)} className="h-11 flex-1 sm:h-9">
                            Close
                        </Button>
                        <Button onClick={applyFilters} className="h-11 flex-1 sm:h-9">
                            Apply filters
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
