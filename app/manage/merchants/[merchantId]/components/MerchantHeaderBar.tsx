'use client'

import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/dashboard/shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MerchantDetails } from '@/types/merchant'
import { ImpersonateMerchantButton } from '@/components/admin/ImpersonateMerchantButton'
import { MerchantLogoUpload } from './MerchantLogoUpload'

/**
 * The page header for the merchant workspace: `PageHeader` owns the one `<h1>`
 * (D-01) and the back pill (D-04, replacing the hand-rolled breadcrumb), and
 * the identity row beneath carries the record's metadata.
 */
export function MerchantHeaderBar({
    merchant,
    actions,
}: {
    merchant: MerchantDetails
    /** Extra page-level actions rendered before Copy ID / View as merchant. */
    actions?: React.ReactNode
}) {
    const status = merchant.onboarding_status || merchant.derived_status
    const planLabel = (merchant.public_metadata as { plan?: string })?.plan || 'Starter'
    const locationLabel = `${merchant.total_locations} location${merchant.total_locations === 1 ? '' : 's'}`

    return (
        <div className="space-y-4">
            <PageHeader
                title={merchant.name}
                backHref="/manage/merchants"
                backLabel="Back to Merchants"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {actions}
                        <Button
                            variant="outline"
                            className="h-9 px-4 text-[0.8125rem] font-medium shadow-sm"
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
                }
            />

            <div className="flex min-w-0 items-center gap-4">
                {/* The logo plate is the upload control, so it stays a control,
                    but like every brand mark it drops below `sm` (§13.4). */}
                <div className="hidden shrink-0 sm:block">
                    <MerchantLogoUpload
                        merchantId={merchant.id}
                        merchantName={merchant.name}
                        logoUrl={merchant.logo_url}
                    />
                </div>
                <div className="min-w-0 space-y-1.5">
                    {/* Status is a word in a neutral pill (§4.6b). */}
                    <Badge variant="outline" className="w-fit capitalize">
                        {status.replace('_', ' ')}
                    </Badge>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-muted-foreground">
                        <span className="max-w-full truncate font-mono">{merchant.clerk_org_id}</span>
                        <span aria-hidden>·</span>
                        <span>{planLabel}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">{locationLabel}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">
                            Onboarded {new Date(merchant.created_at).toLocaleDateString()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
