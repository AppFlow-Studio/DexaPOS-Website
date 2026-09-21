'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MerchantDetails } from '@/types/merchant'
import { ImpersonateMerchantButton } from '@/components/admin/ImpersonateMerchantButton'
import { MerchantLogoUpload } from './MerchantLogoUpload'

// One neutral pill for every merchant status (D-03): foreground text on a faded
// fill. The status word carries the state.
const STATUS_CLASS =
    'w-fit shrink-0 rounded-full border-0 bg-muted px-2.5 text-xs font-medium capitalize text-foreground'

export function MerchantHeaderBar({ merchant }: { merchant: MerchantDetails }) {
    const status = merchant.onboarding_status || merchant.derived_status
    const planLabel = (merchant.public_metadata as { plan?: string })?.plan || 'Starter'
    const locationLabel = `${merchant.total_locations} location${merchant.total_locations === 1 ? '' : 's'}`

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4 min-w-0">
                <MerchantLogoUpload
                    merchantId={merchant.id}
                    merchantName={merchant.name}
                    logoUrl={merchant.logo_url}
                />
                <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="text-[22px] leading-tight tracking-[-0.015em] text-foreground">
                            {merchant.name}
                        </h1>
                        <Badge variant="secondary" className={STATUS_CLASS}>
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

            <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
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
