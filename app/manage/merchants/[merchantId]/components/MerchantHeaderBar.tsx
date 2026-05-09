'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MerchantDetails } from '@/types/merchant'
import { ImpersonateMerchantButton } from '@/components/admin/ImpersonateMerchantButton'
import { MerchantLogoUpload } from './MerchantLogoUpload'

const STATUS_CLASS: Record<string, string> = {
    created: 'bg-slate-100 text-slate-700 border-slate-300',
    onboarding: 'bg-amber-100 text-amber-800 border-amber-200',
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    suspended: 'bg-red-100 text-red-700 border-red-300',
    cancelled: 'bg-zinc-200 text-zinc-700 border-zinc-300',
    inactive: 'bg-red-100 text-red-700 border-red-300',
}

export function MerchantHeaderBar({ merchant }: { merchant: MerchantDetails }) {
    const status = merchant.onboarding_status || merchant.derived_status
    const planLabel = (merchant.public_metadata as { plan?: string })?.plan || 'Starter'
    const locationLabel = `${merchant.total_locations} location${merchant.total_locations === 1 ? '' : 's'}`

    return (
        <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
                <MerchantLogoUpload
                    merchantId={merchant.id}
                    merchantName={merchant.name}
                    logoUrl={merchant.logo_url}
                />
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <h1 className=" text-[22px] leading-tight tracking-[-0.015em] text-foreground">
                            {merchant.name}
                        </h1>
                        <Badge className={STATUS_CLASS[status] || STATUS_CLASS.onboarding}>
                            {status.replace('_', ' ')}
                        </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                        <span className="font-mono">{merchant.clerk_org_id}</span>
                        <span aria-hidden>·</span>
                        <span>{planLabel}</span>
                        <span aria-hidden>·</span>
                        <span>{locationLabel}</span>
                        <span aria-hidden>·</span>
                        <span>Onboarded {new Date(merchant.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        navigator.clipboard.writeText(merchant.clerk_org_id)
                        toast.success('Merchant ID copied')
                    }}
                >
                    <Copy className="h-3.5 w-3.5" />
                    Copy ID
                </Button>
                <ImpersonateMerchantButton merchantId={merchant.id} merchantName={merchant.name} />
            </div>
        </div>
    )
}
