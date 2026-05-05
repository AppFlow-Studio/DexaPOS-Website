'use client'

import { useMemo, useState } from 'react'
import { Search, Store, MapPin, CheckCircle2, Loader2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { MerchantSummary } from '@/types/merchant'

interface GrantMerchantAccessDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    userName: string
    availableMerchants: MerchantSummary[]
    isPending: boolean
    onGrant: (merchantId: string) => void
}

export function GrantMerchantAccessDialog({
    open,
    onOpenChange,
    userName,
    availableMerchants,
    isPending,
    onGrant,
}: GrantMerchantAccessDialogProps) {
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<string>('')

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return availableMerchants
        return availableMerchants.filter((m) => m.name.toLowerCase().includes(q))
    }, [availableMerchants, search])

    const handleOpenChange = (next: boolean) => {
        if (isPending) return
        if (!next) {
            setSearch('')
            setSelected('')
        }
        onOpenChange(next)
    }

    const handleGrant = () => {
        if (!selected || isPending) return
        onGrant(selected)
    }

    const selectedMerchant = availableMerchants.find((m) => m.id === selected)

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                                <Store className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-base">Grant merchant access</DialogTitle>
                                <DialogDescription className="text-xs mt-0.5">
                                    Choose a merchant to grant{' '}
                                    <span className="font-medium text-foreground">{userName}</span>{' '}
                                    access to.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Search */}
                    <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search merchants..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 h-9 text-sm"
                            autoComplete="off"
                        />
                    </div>
                </div>

                {/* Merchant list */}
                <div className="overflow-y-auto max-h-72 px-3 py-2">
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <Store className="h-8 w-8 text-muted-foreground/40 mb-2" />
                            <p className="text-sm text-muted-foreground">
                                {search ? 'No merchants match your search.' : 'No merchants available to grant.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map((merchant) => {
                                const isSelected = selected === merchant.id
                                const initials = merchant.name.substring(0, 2).toUpperCase()

                                return (
                                    <button
                                        key={merchant.id}
                                        type="button"
                                        onClick={() => setSelected(isSelected ? '' : merchant.id)}
                                        disabled={isPending}
                                        className={cn(
                                            'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                            'disabled:opacity-50 disabled:cursor-not-allowed',
                                            isSelected
                                                ? 'bg-primary/8 ring-1 ring-primary/30'
                                                : 'hover:bg-muted/60'
                                        )}
                                    >
                                        <Avatar className="h-9 w-9 shrink-0 rounded-lg">
                                            <AvatarImage
                                                src={merchant.logo_url ?? ''}
                                                alt={merchant.name}
                                                className="object-cover"
                                            />
                                            <AvatarFallback className="rounded-lg bg-orange-100 text-orange-700 text-xs font-semibold">
                                                {initials}
                                            </AvatarFallback>
                                        </Avatar>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-medium truncate">
                                                    {merchant.name}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'text-[10px] px-1.5 py-0 h-4 shrink-0',
                                                        merchant.derived_status === 'active'
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : merchant.derived_status === 'onboarding'
                                                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                              : 'bg-muted text-muted-foreground'
                                                    )}
                                                >
                                                    {merchant.derived_status}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                                <span className="text-xs text-muted-foreground">
                                                    {merchant.active_locations}{' '}
                                                    {merchant.active_locations === 1 ? 'location' : 'locations'}
                                                </span>
                                            </div>
                                        </div>

                                        <div
                                            className={cn(
                                                'h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors',
                                                isSelected
                                                    ? 'border-primary bg-primary'
                                                    : 'border-muted-foreground/30'
                                            )}
                                        >
                                            {isSelected && (
                                                <CheckCircle2 className="h-3 w-3 text-white" />
                                            )}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-muted/20">
                    {selectedMerchant && (
                        <p className="text-xs text-muted-foreground mb-3">
                            Granting access to{' '}
                            <span className="font-medium text-foreground">
                                {selectedMerchant.name}
                            </span>
                            .
                        </p>
                    )}
                    <DialogFooter className="gap-2 sm:gap-2 justify-between sm:justify-between">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenChange(false)}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleGrant}
                            disabled={!selected || isPending}
                        >
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isPending ? 'Granting...' : 'Grant access'}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}
