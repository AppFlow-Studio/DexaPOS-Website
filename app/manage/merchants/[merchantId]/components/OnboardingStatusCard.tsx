'use client'

import { useMemo } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MerchantDetails, MerchantOnboardingChecklist, MerchantOnboardingStatus } from '@/types/merchant'

interface OnboardingStatusCardProps {
  merchant: MerchantDetails
}

const STATUS_META: Record<
  MerchantOnboardingStatus,
  { label: string; badgeClass: string; description: string }
> = {
  created: {
    label: 'Created',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    description: 'Merchant created but setup has not started.',
  },
  onboarding: {
    label: 'Onboarding',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-300',
    description: 'Merchant setup is in progress.',
  },
  active: {
    label: 'Active',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    description: 'Merchant is live and processing payments.',
  },
  suspended: {
    label: 'Suspended',
    badgeClass: 'bg-red-100 text-red-700 border-red-300',
    description: 'Merchant access is temporarily suspended.',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-zinc-200 text-zinc-700 border-zinc-300',
    description: 'Merchant account has been cancelled.',
  },
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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
    <Card>
      <CardHeader className="pb-4">
        <div>
          <CardTitle className="text-lg">Merchant Status</CardTitle>
          <div className="mt-2 flex items-center gap-2">
            <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
            <span className="text-sm text-muted-foreground">{statusMeta.description}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  )
}
