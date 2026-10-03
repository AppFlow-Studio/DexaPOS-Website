'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import {
  upsertSubscriptionPlan,
  type SubscriptionPlanRecord,
} from '@/app/manage/actions/subscription-billing'
import {
  AffixedNumberInput,
  CatalogFormDialog,
  FORWARD_ONLY_NOTE,
  FormField,
  FormGroup,
  StatusSelect,
} from './CatalogFormDialog'
import { parseMoneyInput, parsePercentInput, parsePositiveInteger } from './catalog-format'

type PlanForm = {
  planCode: string
  displayName: string
  basePriceMonthly: string
  includedStations: string
  perExtraStationPrice: string
  cardSurchargePct: string
  isActive: boolean
}

/** A missing plan opens with the defaults the catalog has always seeded. */
function toForm(plan: SubscriptionPlanRecord | null): PlanForm {
  return {
    planCode: plan?.plan_code ?? 'SERVICE_CATALOG',
    displayName: plan?.display_name ?? 'Dexa POS Base',
    basePriceMonthly: String(plan?.base_price_monthly ?? 99),
    includedStations: String(plan?.included_stations ?? 1),
    perExtraStationPrice: String(plan?.per_extra_station_price ?? 49),
    cardSurchargePct: String(plan?.card_surcharge_pct ?? 4),
    isActive: plan?.is_active ?? true,
  }
}

export function PlanPricingDialog({
  open,
  plan,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** `null` creates the plan. */
  plan: SubscriptionPlanRecord | null
  onOpenChange: (open: boolean) => void
  onSaved: (planId: string | undefined) => void
}) {
  // Seeded once: the parent remounts this dialog (a new `key`) on every open.
  const [form, setForm] = useState<PlanForm>(() => toForm(plan))
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const included = parsePositiveInteger(form.includedStations)

  const save = () => {
    startTransition(async () => {
      const result = await upsertSubscriptionPlan({
        planId: plan?.id ?? null,
        planCode: form.planCode.trim(),
        displayName: form.displayName.trim(),
        basePriceMonthly: parseMoneyInput(form.basePriceMonthly),
        includedStations: included,
        perExtraStationPrice: parseMoneyInput(form.perExtraStationPrice),
        cardSurchargePct: parsePercentInput(form.cardSurchargePct),
        isActive: form.isActive,
        metadata: { source: 'hq_billing_catalog', pricingModel: 'service_catalog' },
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save the station plan.')
        return
      }
      toast.success(plan ? 'Station plan pricing saved.' : 'Station plan created.')
      onSaved(result.planId)
    })
  }

  return (
    <CatalogFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? 'Edit station plan' : 'Create station plan'}
      description={FORWARD_ONLY_NOTE}
      submitLabel={plan ? 'Save pricing' : 'Create plan'}
      submitDisabled={!form.planCode.trim() || !form.displayName.trim()}
      pending={pending}
      onSubmit={save}
    >
      <FormGroup title="Plan">
        <FormField id="plan-name" label="Display name" className="sm:col-span-2">
          <Input
            id="plan-name"
            required
            value={form.displayName}
            onChange={(event) => set('displayName', event.target.value)}
          />
        </FormField>
        <FormField id="plan-code" label="Plan code">
          <Input
            id="plan-code"
            required
            className="font-mono"
            value={form.planCode}
            onChange={(event) => set('planCode', event.target.value)}
          />
        </FormField>
        <FormField id="plan-status" label="Status">
          <StatusSelect id="plan-status" isActive={form.isActive} onChange={(value) => set('isActive', value)} />
        </FormField>
      </FormGroup>

      <FormGroup title="Station pricing">
        <FormField id="plan-base" label="Base price" hint="Per month. Covers the included stations." hideHintOnMobile>
          <AffixedNumberInput
            id="plan-base"
            affix="$"
            position="start"
            min={0}
            step="0.01"
            value={form.basePriceMonthly}
            onChange={(event) => set('basePriceMonthly', event.target.value)}
          />
        </FormField>
        <FormField id="plan-included" label="Included stations">
          <Input
            id="plan-included"
            type="number"
            inputMode="numeric"
            min={0}
            step="1"
            className="tabular-nums"
            value={form.includedStations}
            onChange={(event) => set('includedStations', event.target.value)}
          />
        </FormField>
        <FormField
          id="plan-extra"
          label="Each extra station"
          hint={`Per month, for every station beyond ${included}.`}
          hideHintOnMobile
        >
          <AffixedNumberInput
            id="plan-extra"
            affix="$"
            position="start"
            min={0}
            step="0.01"
            value={form.perExtraStationPrice}
            onChange={(event) => set('perExtraStationPrice', event.target.value)}
          />
        </FormField>
        <FormField id="plan-surcharge" label="Card surcharge">
          <AffixedNumberInput
            id="plan-surcharge"
            affix="%"
            position="end"
            min={0}
            max={100}
            step="0.01"
            value={form.cardSurchargePct}
            onChange={(event) => set('cardSurchargePct', event.target.value)}
          />
        </FormField>
      </FormGroup>
    </CatalogFormDialog>
  )
}
