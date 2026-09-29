'use client'

import { useMemo } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { Panel } from '@/components/dashboard/shell/Panel'
import { PanelSection } from '@/components/dashboard/shell/PanelSection'
import { useAdminPermissions } from '@/lib/hooks/useAdminPermissions'
import type { MerchantDetails, MerchantOnboardingChecklist, MerchantOnboardingStatus } from '@/types/merchant'
import { MerchantSubscriptionSummary } from './MerchantSubscriptionSummary'

interface OnboardingStatusCardProps {
  merchant: MerchantDetails
}

const CHECKLIST_STEPS: { key: keyof MerchantOnboardingChecklist; label: string }[] = [
  { key: 'businessInfo', label: 'Business info completed' },
  { key: 'ownerInvited', label: 'Owner invited' },
  { key: 'billingAdded', label: 'Billing method added' },
  { key: 'firstLocation', label: 'First location created' },
  { key: 'firstPayment', label: 'First payment processed' },
]

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

function formatActivatedDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Setup progress plus the billing summary. The status word itself lives in the
 * page header badge, so it is not repeated here; a finished checklist collapses
 * to one caption line and only an unfinished one lists its steps.
 */
export function OnboardingStatusCard({ merchant }: OnboardingStatusCardProps) {
  const { hasPermission } = useAdminPermissions()
  const canViewBilling = hasPermission('system.billing.manage')
  const status = (merchant.onboarding_status || 'onboarding') as MerchantOnboardingStatus

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

  const doneCount = CHECKLIST_STEPS.filter((step) => checklist[step.key]).length
  const setupComplete = doneCount === CHECKLIST_STEPS.length

  const caption = setupComplete
    ? merchant.activated_at
      ? `Setup complete · Activated ${formatActivatedDate(merchant.activated_at)}`
      : 'Setup complete'
    : `${doneCount} of ${CHECKLIST_STEPS.length} setup steps done`

  return (
    <Panel>
      {/* A finished setup is history, not status: its caption is hidden on
          phones. Unfinished progress ("3 of 5") stays visible everywhere. */}
      <PanelSection
        showCaptionOnMobile={!setupComplete}
        label="Merchant Status"
        caption={caption}
      >
        {/* No children when there is nothing to list, so the section keeps no
            empty content gap under the caption. */}
        {(!setupComplete || canViewBilling) && (
          <div className="space-y-3">
            {!setupComplete &&
              CHECKLIST_STEPS.map((step) => (
                <ChecklistRow key={step.key} label={step.label} done={checklist[step.key]} />
              ))}

            {canViewBilling && (
              <MerchantSubscriptionSummary
                merchantId={merchant.id}
                manageHref={`/manage/merchants/${merchant.clerk_org_id}?tab=subscriptions`}
                isFirstBlock={setupComplete}
              />
            )}
          </div>
        )}
      </PanelSection>
    </Panel>
  )
}
