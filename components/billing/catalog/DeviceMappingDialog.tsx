'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  upsertDeviceBillingServiceMapping,
  type BillableServiceRecord,
  type DeviceBillingServiceMappingRecord,
} from '@/app/manage/actions/subscription-billing'
import { Select, SelectValue } from '@/components/ui/select'
import {
  CatalogFormDialog,
  CatalogSelectContent,
  CatalogSelectItem,
  FormField,
  FormGroup,
  MutedSelectTrigger,
  StatusSelect,
} from './CatalogFormDialog'
import { deviceCategoryLabel } from './catalog-format'

export function DeviceMappingDialog({
  open,
  deviceCategory,
  mapping,
  services,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  deviceCategory: string
  /** `null` when the category is not mapped yet. */
  mapping: DeviceBillingServiceMappingRecord | null
  services: BillableServiceRecord[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  // Seeded once: the parent remounts this dialog (a new `key`) on every open.
  // An unmapped category starts on the service that shares its code, if any.
  const [serviceCode, setServiceCode] = useState(
    () =>
      mapping?.service_code ??
      services.find((service) => service.service_code === deviceCategory)?.service_code ??
      ''
  )
  const [isActive, setIsActive] = useState(mapping?.is_active ?? true)
  const [pending, startTransition] = useTransition()

  const label = deviceCategoryLabel(deviceCategory)
  // A mapping can point at a code the catalog no longer lists; keep it selectable.
  const orphanedCode =
    serviceCode && !services.some((service) => service.service_code === serviceCode) ? serviceCode : null

  const save = () => {
    startTransition(async () => {
      const result = await upsertDeviceBillingServiceMapping({
        deviceCategory,
        serviceCode,
        isActive,
        metadata: { source: 'hq_billing_catalog' },
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save the device mapping.')
        return
      }
      toast.success(`${label} billing saved.`)
      onSaved()
    })
  }

  return (
    <CatalogFormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={mapping ? `${label} billing` : `Map ${label.toLowerCase()}`}
      description="Deploying or removing this device adjusts the chosen service's quantity on the location's subscription."
      submitLabel={mapping ? 'Save mapping' : 'Map device'}
      submitDisabled={!serviceCode}
      pending={pending}
      onSubmit={save}
    >
      <FormGroup title="Billing" columns={1}>
        <FormField id="mapping-service" label="Billed as">
          <Select value={serviceCode} onValueChange={setServiceCode}>
            <MutedSelectTrigger id="mapping-service">
              <SelectValue placeholder={services.length ? 'Choose a service' : 'No services in the catalog'} />
            </MutedSelectTrigger>
            {/* The list stays inside the panel and scrolls there (CatalogSelectContent). */}
            <CatalogSelectContent>
              {orphanedCode && (
                <CatalogSelectItem value={orphanedCode}>
                  <span className="font-mono text-xs">{orphanedCode}</span> · not in catalog
                </CatalogSelectItem>
              )}
              {services.map((service) => (
                <CatalogSelectItem key={service.id} value={service.service_code}>
                  {service.display_name}
                  {!service.is_active && ' · Inactive'}
                </CatalogSelectItem>
              ))}
            </CatalogSelectContent>
          </Select>
        </FormField>
        <FormField id="mapping-status" label="Status">
          <StatusSelect id="mapping-status" isActive={isActive} onChange={setIsActive} />
        </FormField>
      </FormGroup>
    </CatalogFormDialog>
  )
}

