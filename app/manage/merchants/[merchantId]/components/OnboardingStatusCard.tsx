'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CheckCircle2, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import type { MerchantDetails, MerchantOnboardingChecklist, MerchantOnboardingStatus } from '@/types/merchant'
import { MerchantSubscriptionSummary } from './MerchantSubscriptionSummary'

interface OnboardingStatusCardProps {
  merchant: MerchantDetails
}

// One neutral badge for every state (D-03): colour is reserved for real
// severity, and an onboarding status is not an alarm.
const STATUS_META: Record<
  MerchantOnboardingStatus,
  { label: string; description: string }
> = {
  created: {
    label: 'Created',
    description: 'Merchant created but setup has not started.',
  },
  onboarding: {
    label: 'Onboarding',
    description: 'Merchant setup is in progress.',
  },
  active: {
    label: 'Active',
    description: 'Merchant is live and processing payments.',
  },
  suspended: {
    label: 'Suspended',
    description: 'Merchant access is temporarily suspended.',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Merchant account has been cancelled.',
  },
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  )
}

export function OnboardingStatusCard({ merchant }: OnboardingStatusCardProps) {
  const status = (merchant.onboarding_status || 'onboarding') as MerchantOnboardingStatus
  const statusMeta = STATUS_META[status]

  const checklist: MerchantOnboardingChecklist = useMemo(
    () =>
      merchant.onboarding_checklist || {
        businessInfo: Boolean(merchant.business_legal_name && merchant.owner_email),
        ownerInvited: Boolean(merchant.clerk_org_id),
        billingAdded: false,
        firstLocation: (merchant.locations || []).length > 0,
        firstPayment: status === 'active',
      },
    [merchant, status]
  )

  return (
    <Panel>
      <PanelSection
        label="Merchant Status"
        caption={
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="w-fit shrink-0 rounded-full border-0 px-2.5 text-xs font-medium capitalize"
            >
              {statusMeta.label}
            </Badge>
            <span>{statusMeta.description}</span>
          </span>
        }
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/manage/merchants/${merchant.clerk_org_id}?tab=subscriptions`}>
              Manage
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        }
      >
        <div className="space-y-3">
          <ChecklistRow label="Business info completed" done={checklist.businessInfo} />
          <ChecklistRow label="Owner invited" done={checklist.ownerInvited} />
          <ChecklistRow label="Billing method added" done={checklist.billingAdded} />
          <ChecklistRow label="First location created" done={checklist.firstLocation} />
          <ChecklistRow label="First payment processed" done={checklist.firstPayment} />

          {merchant.activated_at && (
            <div className="pt-1 text-xs text-muted-foreground">
              Activated: {new Date(merchant.activated_at).toLocaleString()}
            </div>
          )}

          <MerchantSubscriptionSummary merchantId={merchant.id} />
        </div>
      </PanelSection>
    </Panel>
  )
}
