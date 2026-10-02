'use client'

import { useState } from 'react'
import { Check, Search } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { useMerchants } from '@/lib/queries/use-merchants'
import { DEFAULT_MERCHANT_FILTERS } from '@/types/merchant'

/** Matches shown per search. The search runs on the server, so every merchant is reachable. */
const RESULT_LIMIT = 20

interface GrantMerchantAccessDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userName: string
    /** Merchants the user can already open; they are left out of the results. */
    excludeMerchantIds: ReadonlySet<string>
    isPending: boolean
    onGrant: (merchantId: string) => void
}

/**
 * Picks one merchant to grant access to. A list the user works through, so it
 * goes full screen below `sm`; the dialog clips and only the list scrolls (§12).
 */
export function GrantMerchantAccessDialog({
    open,
    onOpenChange,
    userName,
    excludeMerchantIds,
    isPending,
    onGrant,
}: GrantMerchantAccessDialogProps) {
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)

    const handleOpenChange = (next: boolean) => {
        if (isPending) return
        if (!next) {
            setSearch('')
            setSelected(null)
        }
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh] sm:max-w-lg">
                <DialogHeader className="shrink-0 px-6 pb-4 pr-14 pt-6 text-left">
                    <DialogTitle>Grant merchant access</DialogTitle>
                    <DialogDescription>
                        Choose a merchant <span className="font-medium text-foreground">{userName}</span> can open
                        and manage.
                    </DialogDescription>
                    <div className="relative mt-3">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input
                            aria-label="Search merchants"
                            placeholder="Search merchants by name"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="h-9 pl-9 text-[0.8125rem]"
                            autoComplete="off"
                        />
                    </div>
                </DialogHeader>

                {/* Mounted only while open (Radix unmounts closed content), so the
                    merchant query never runs for a closed dialog. */}
                <MerchantResults
                    search={search}
                    excludeMerchantIds={excludeMerchantIds}
                    selectedId={selected?.id ?? null}
                    disabled={isPending}
                    onSelect={setSelected}
                />

                <DialogFooter className="shrink-0 gap-2 px-6 pb-6 pt-4 sm:justify-between">
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={() => selected && onGrant(selected.id)} disabled={!selected || isPending}>
                        {isPending ? 'Granting…' : selected ? `Grant access to ${selected.name}` : 'Grant access'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function MerchantResults({
    search,
    excludeMerchantIds,
    selectedId,
    disabled,
    onSelect,
}: {
    search: string
    excludeMerchantIds: ReadonlySet<string>
    selectedId: string | null
    disabled: boolean
    onSelect: (merchant: { id: string; name: string } | null) => void
}) {
    const debouncedSearch = useDebounce(search.trim(), 250)
    const { data, isLoading, isError } = useMerchants(
        { ...DEFAULT_MERCHANT_FILTERS, search: debouncedSearch },
        1,
        undefined,
        RESULT_LIMIT
    )
    const merchants = (data?.merchants ?? []).filter((merchant) => !excludeMerchantIds.has(merchant.id))
    const total = data?.total ?? 0

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-2" role="listbox" aria-label="Merchants">
            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-14 w-full rounded-2xl" />
                    ))}
                </div>
            ) : isError ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                    Merchants could not be loaded. Close the dialog and try again.
                </p>
            ) : merchants.length === 0 ? (
                // Granted merchants are dropped after the server returns its first
                // matches, so "all shown are granted" is not "none are left".
                <div className="py-10 text-center">
                    <p className="text-sm font-medium">
                        {total === 0
                            ? debouncedSearch
                                ? 'No merchants match this search'
                                : 'No merchants yet'
                            : total > RESULT_LIMIT
                              ? `This user already has the first ${RESULT_LIMIT} matches`
                              : 'This user already has every match'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {total > RESULT_LIMIT
                            ? `${total} merchants match. Search by name to find one they don’t have yet.`
                            : 'Try another name.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {merchants.map((merchant) => {
                        const isSelected = selectedId === merchant.id
                        return (
                            <button
                                key={merchant.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => onSelect(isSelected ? null : { id: merchant.id, name: merchant.name })}
                                disabled={disabled}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                                    // Selected is a ring on a deeper fill, never a hue (§3.5).
                                    isSelected ? 'bg-muted ring-1 ring-border' : 'bg-muted/45 hover:bg-muted'
                                )}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{merchant.name}</p>
                                    <p className="mt-0.5 text-xs capitalize text-muted-foreground tabular-nums">
                                        {merchant.derived_status || 'Unknown'} · {merchant.active_locations}{' '}
                                        {merchant.active_locations === 1 ? 'location' : 'locations'}
                                    </p>
                                </div>
                                <span
                                    aria-hidden
                                    className={cn(
                                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                        isSelected
                                            ? 'border-foreground bg-foreground text-background'
                                            : 'border-muted-foreground/40'
                                    )}
                                >
                                    {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                </span>
                            </button>
                        )
                    })}
                    {total > RESULT_LIMIT && (
                        <p className="px-1 pt-1 text-xs text-muted-foreground tabular-nums">
                            Showing the first {RESULT_LIMIT} of {total} matches. Search to narrow them down.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}
