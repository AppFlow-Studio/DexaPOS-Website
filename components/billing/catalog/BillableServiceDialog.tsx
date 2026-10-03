'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Select, SelectValue } from '@/components/ui/select'
import {
  upsertBillableService,
  type BillableServiceRecord,
} from '@/app/manage/actions/subscription-billing'
import {
  AffixedNumberInput,
  CatalogFormDialog,
  CatalogSelectContent,
  CatalogSelectItem,
  FORWARD_ONLY_NOTE,
  FormField,
  FormGroup,
  MutedSelectTrigger,
  StatusSelect,
} from './CatalogFormDialog'
import {
  PRICING_MODEL_LABELS,
  SERVICE_CATEGORY_LABELS,
  parseMoneyInput,
  parsePositiveInteger,
} from './catalog-format'

type ServiceForm = {
  serviceCode: string
  displayName: string
  serviceCategory: BillableServiceRecord['service_category']
  pricingModel: BillableServiceRecord['pricing_model']
  basePriceMonthly: string
  additionalUnitPrice: string
  includedQuantity: string
  unitLabel: string
  isActive: boolean
}

function toForm(service: BillableServiceRecord | null): ServiceForm {
  return {
    serviceCode: service?.service_code ?? '',
    displayName: service?.display_name ?? '',
    serviceCategory: service?.service_category ?? 'software',
    pricingModel: service?.pricing_model ?? 'flat',
    basePriceMonthly: String(service?.base_price_monthly ?? 0),
    additionalUnitPrice:
      service?.additional_unit_price === null || service?.additional_unit_price === undefined
        ? ''
        : String(service.additional_unit_price),
    includedQuantity: String(service?.included_quantity ?? 0),
    unitLabel: service?.unit_label ?? 'unit',
    isActive: service?.is_active ?? true,
  }
}

export function BillableServiceDialog({
  open,
  service,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** `null` creates a new service. */
  service: BillableServiceRecord | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  // Seeded once: the parent remounts this dialog (a new `key`) on every open.
  const [form, setForm] = useState<ServiceForm>(() => toForm(service))
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const save = () => {
    startTransition(async () => {
      const result = await upsertBillableService({
        serviceId: service?.id ?? null,
        serviceCode: form.serviceCode.trim(),
        displayName: form.displayName.trim(),
        serviceCategory: form.serviceCategory,
        pricingModel: form.pricingModel,
        basePriceMonthly: parseMoneyInput(form.basePriceMonthly),
        additionalUnitPrice:
          form.additionalUnitPrice.trim().length > 0 ? parseMoneyInput(form.additionalUnitPrice) : null,
        includedQuantity: parsePositiveInteger(form.includedQuantity),
        unitLabel: form.unitLabel.trim() || 'unit',
        isActive: form.isActive,
        metadata: { source: 'hq_billing_catalog' },
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save the service.')
        return
      }
      toast.success(service ? 'Service pricing saved.' : 'Service added to the catalog.')
      onSaved()
    })
  }

  return (
    <CatalogFormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={service ? `Edit ${service.display_name}` : 'New service'}
      description={FORWARD_ONLY_NOTE}
      submitLabel={service ? 'Save service' : 'Add service'}
      submitDisabled={!form.serviceCode.trim() || !form.displayName.trim()}
      pending={pending}
      onSubmit={save}
    >
      <FormGroup title="Service">
        <FormField id="service-name" label="Display name" className="sm:col-span-2">
          <Input
            id="service-name"
            required
            placeholder="e.g. Online ordering"
            value={form.displayName}
            onChange={(event) => set('displayName', event.target.value)}
          />
        </FormField>
        <FormField
          id="service-code"
          label="Service code"
          hint={service ? 'Device mappings refer to this code.' : undefined}
        >
          <Input
            id="service-code"
            required
            className="font-mono"
            placeholder="e.g. online_ordering"
            value={form.serviceCode}
            onChange={(event) => set('serviceCode', event.target.value)}
          />
        </FormField>
        <FormField id="service-category" label="Category">
          <Select
            value={form.serviceCategory}
            onValueChange={(value) => set('serviceCategory', value as ServiceForm['serviceCategory'])}
          >
            <MutedSelectTrigger id="service-category">
              <SelectValue />
            </MutedSelectTrigger>
            <CatalogSelectContent>
              {Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => (
                <CatalogSelectItem key={value} value={value}>
                  {label}
                </CatalogSelectItem>
              ))}
            </CatalogSelectContent>
          </Select>
        </FormField>
        <FormField id="service-status" label="Status">
          <StatusSelect id="service-status" isActive={form.isActive} onChange={(value) => set('isActive', value)} />
        </FormField>
      </FormGroup>

      <FormGroup title="Pricing">
        <FormField id="service-model" label="Pricing model">
          <Select
            value={form.pricingModel}
            onValueChange={(value) => set('pricingModel', value as ServiceForm['pricingModel'])}
          >
            <MutedSelectTrigger id="service-model">
              <SelectValue />
            </MutedSelectTrigger>
            <CatalogSelectContent>
              {Object.entries(PRICING_MODEL_LABELS).map(([value, label]) => (
                <CatalogSelectItem key={value} value={value}>
                  {label}
                </CatalogSelectItem>
              ))}
            </CatalogSelectContent>
          </Select>
        </FormField>
        <FormField id="service-base" label="Base monthly price">
          <AffixedNumberInput
            id="service-base"
            affix="$"
            position="start"
            min={0}
            step="0.01"
            value={form.basePriceMonthly}
            onChange={(event) => set('basePriceMonthly', event.target.value)}
          />
        </FormField>
        <FormField id="service-included" label="Included quantity">
          <Input
            id="service-included"
            type="number"
            inputMode="numeric"
            min={0}
            step="1"
            className="tabular-nums"
            value={form.includedQuantity}
            onChange={(event) => set('includedQuantity', event.target.value)}
          />
        </FormField>
        <FormField id="service-unit" label="Unit label" hint="What one unit is called, e.g. tablet or location.">
          <Input
            id="service-unit"
            value={form.unitLabel}
            onChange={(event) => set('unitLabel', event.target.value)}
          />
        </FormField>
        <FormField id="service-additional" label="Additional unit price" hint="Only for tiered pricing. Leave empty otherwise.">
          <AffixedNumberInput
            id="service-additional"
            affix="$"
            position="start"
            min={0}
            step="0.01"
            value={form.additionalUnitPrice}
            onChange={(event) => set('additionalUnitPrice', event.target.value)}
          />
        </FormField>
      </FormGroup>

      <p className="text-xs text-muted-foreground">
        Card surcharge is one platform-wide rate applied to the whole invoice. It is not set per
        service.
      </p>
    </CatalogFormDialog>
  )
}
