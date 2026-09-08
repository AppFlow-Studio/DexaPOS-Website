'use client'

import { BellRing, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type {
  MerchantTierPlanRequestRecord,
  MerchantServiceRequestRecord,
  MerchantHardwareRequestRecord,
} from '@/app/manage/actions/subscription-billing'
import { InfoHint } from './InfoHint'
import { formatMoney, formatTierPrice } from './helpers'

type Decision = 'approved' | 'denied'

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function cadenceLabel(cadence: string | null | undefined): string {
  if (cadence === 'monthly_recurring') return 'Monthly recurring'
  if (cadence === 'one_time') return 'One-time'
  return cadence ? cadence.replace(/_/g, ' ') : '—'
}

/** Compact "label: value · label: value" strip for request provenance. */
function MetaLine({ items }: { items: Array<{ label: string; value: string } | false | null | undefined> }) {
  const visible = items.filter(Boolean) as Array<{ label: string; value: string }>
  if (visible.length === 0) return null
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {visible.map((item) => (
        <div key={item.label} className="flex gap-1">
          <dt className="font-medium text-foreground/70">{item.label}:</dt>
          <dd className="break-all">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Collapsible authorization audit trail (reference, consent, IP, device). */
function AuthorizationEvidence({ rows }: { rows: Array<{ label: string; value: string | null | undefined }> }) {
  const visible = rows.filter((row) => row.value) as Array<{ label: string; value: string }>
  if (visible.length === 0) return null
  return (
    <details className="mt-2 rounded-lg border bg-muted/30 p-2 text-xs">
      <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
        Authorization evidence
      </summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        {visible.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="uppercase tracking-wide text-muted-foreground/70">{row.label}</dt>
            <dd className="mt-0.5 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

interface ReviewChangesSectionProps {
  pendingTierRequest: MerchantTierPlanRequestRecord | null
  onApproveTier: () => void
  onDenyTier: () => void
  tierNote: string
  onTierNoteChange: (value: string) => void

  pendingServiceRequests: MerchantServiceRequestRecord[]
  onServiceDecision: (request: MerchantServiceRequestRecord, decision: Decision) => void
  serviceNotes: Record<string, string>
  onServiceNoteChange: (id: string, value: string) => void

  pendingHardwareRequests: MerchantHardwareRequestRecord[]
  onHardwareDecision: (request: MerchantHardwareRequestRecord, decision: Decision) => void
  hardwareNotes: Record<string, string>
  onHardwareNoteChange: (id: string, value: string) => void

  isBusy: boolean
}

function DecisionRow({
  onApprove,
  onDeny,
  note,
  onNoteChange,
  disabled,
  approveLabel = 'Approve & charge',
}: {
  onApprove: () => void
  onDeny: () => void
  note: string
  onNoteChange: (v: string) => void
  disabled: boolean
  approveLabel?: string
}) {
  return (
    <div className="mt-3 space-y-2">
      <Textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Decision note (optional)"
        rows={2}
        className="text-sm"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onApprove} disabled={disabled}>
          <Check className="mr-1 h-3.5 w-3.5" />
          {approveLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onDeny} disabled={disabled}>
          <X className="mr-1 h-3.5 w-3.5" />
          Deny
        </Button>
      </div>
    </div>
  )
}

/**
 * Front-and-center hub for billing changes awaiting HQ action — tier-change,
 * paid add-on, and hardware requests — each approvable/deniable inline.
 */
export function ReviewChangesSection({
  pendingTierRequest,
  onApproveTier,
  onDenyTier,
  tierNote,
  onTierNoteChange,
  pendingServiceRequests,
  onServiceDecision,
  serviceNotes,
  onServiceNoteChange,
  pendingHardwareRequests,
  onHardwareDecision,
  hardwareNotes,
  onHardwareNoteChange,
  isBusy,
}: ReviewChangesSectionProps) {
  const total =
    (pendingTierRequest ? 1 : 0) + pendingServiceRequests.length + pendingHardwareRequests.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" />
          Review changes
          {total > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {total}
            </span>
          )}
          <InfoHint label="Billing changes the merchant requested that need HQ approval. Approving a paid request charges the card on file." />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No pending changes to review.
          </div>
        )}

        {/* Tier change request */}
        {pendingTierRequest && (
          <div className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{pendingTierRequest.request_number}</Badge>
              <Badge variant="secondary">Tier change</Badge>
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{pendingTierRequest.requested_plan_name}</span>{' '}
              <span className="text-muted-foreground">
                ({formatTierPrice(pendingTierRequest.requested_monthly_price_cents)}/mo)
              </span>
              {pendingTierRequest.current_plan_name && (
                <span className="text-muted-foreground"> · from {pendingTierRequest.current_plan_name}</span>
              )}
            </div>
            <MetaLine
              items={[
                { label: 'Requested by', value: pendingTierRequest.requested_by },
                { label: 'Submitted', value: formatDateTime(pendingTierRequest.requested_at) },
                { label: 'Billing', value: cadenceLabel(pendingTierRequest.authorized_billing_cadence) },
              ]}
            />
            <AuthorizationEvidence
              rows={[
                { label: 'Reference', value: pendingTierRequest.authorization_reference },
                { label: 'Consent accepted', value: pendingTierRequest.authorization_accepted_at ? formatDateTime(pendingTierRequest.authorization_accepted_at) : null },
                { label: 'Terms version', value: pendingTierRequest.authorization_terms_version },
                { label: 'Authorized price', value: pendingTierRequest.authorized_price_cents != null ? formatMoney(pendingTierRequest.authorized_price_cents / 100) : null },
                { label: 'IP address', value: pendingTierRequest.authorization_ip_address },
                { label: 'Device', value: pendingTierRequest.authorization_user_agent },
              ]}
            />
            <DecisionRow
              onApprove={onApproveTier}
              onDeny={onDenyTier}
              note={tierNote}
              onNoteChange={onTierNoteChange}
              disabled={isBusy}
              approveLabel="Approve, charge & activate"
            />
          </div>
        )}

        {/* Paid add-on requests */}
        {pendingServiceRequests.map((request) => (
          <div key={request.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{request.request_number}</Badge>
              <Badge variant="secondary">Add-on</Badge>
              {request.status === 'processing' && <Badge variant="outline">Processing</Badge>}
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{request.service_name}</span>
              <span className="text-muted-foreground">
                {' '}· {request.location_name} · qty {request.requested_quantity} ·{' '}
                {formatMoney(request.authorized_total)}
              </span>
            </div>
            <MetaLine
              items={[
                { label: 'Requested by', value: request.requested_by_email || request.requested_by },
                { label: 'Submitted', value: formatDateTime(request.requested_at) },
                { label: 'Billing', value: cadenceLabel(request.authorized_billing_cadence) },
                {
                  label: 'Amount',
                  value: `${formatMoney(request.authorized_subtotal)} + ${formatMoney(request.authorized_card_surcharge)} surcharge = ${formatMoney(request.authorized_total)}`,
                },
              ]}
            />
            <AuthorizationEvidence
              rows={[
                { label: 'Reference', value: request.authorization_reference },
                { label: 'Consent accepted', value: request.authorization_accepted_at ? formatDateTime(request.authorization_accepted_at) : null },
                { label: 'Terms version', value: request.authorization_terms_version },
                { label: 'IP address', value: request.authorization_ip_address },
                { label: 'Device', value: request.authorization_user_agent },
              ]}
            />
            <DecisionRow
              onApprove={() => onServiceDecision(request, 'approved')}
              onDeny={() => onServiceDecision(request, 'denied')}
              note={serviceNotes[request.id] ?? ''}
              onNoteChange={(value) => onServiceNoteChange(request.id, value)}
              disabled={isBusy}
              approveLabel="Approve, charge & activate"
            />
          </div>
        ))}

        {/* Hardware requests */}
        {pendingHardwareRequests.map((request) => (
          <div key={request.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{request.request_number}</Badge>
              <Badge variant="secondary">Hardware</Badge>
            </div>
            <div className="mt-2 text-sm">
              <span className="text-muted-foreground">
                {request.location_name} · {request.requested_quantity} device
                {request.requested_quantity === 1 ? '' : 's'}
              </span>
              {request.request_note && (
                <p className="mt-1 text-xs text-muted-foreground">“{request.request_note}”</p>
              )}
            </div>
            <MetaLine
              items={[
                { label: 'Requested by', value: request.requested_by },
                { label: 'Submitted', value: formatDateTime(request.requested_at) },
              ]}
            />
            <DecisionRow
              onApprove={() => onHardwareDecision(request, 'approved')}
              onDeny={() => onHardwareDecision(request, 'denied')}
              note={hardwareNotes[request.id] ?? ''}
              onNoteChange={(value) => onHardwareNoteChange(request.id, value)}
              disabled={isBusy}
              approveLabel="Approve request"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
