'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getBillableServices,
  getDeviceBillingServiceMappings,
  getSubscriptionPlans,
  upsertBillableService,
  upsertDeviceBillingServiceMapping,
  upsertSubscriptionPlan,
  type BillableServiceRecord,
  type DeviceBillingServiceMappingRecord,
  type SubscriptionPlanRecord,
} from '@/app/manage/actions/subscription-billing'

const BILLABLE_DEVICE_CATEGORIES = [
  'pos_tablet',
  'cfd',
  'kds',
  'payment_terminal',
  'receipt_printer',
  'kitchen_printer',
  'cash_drawer',
] as const

type ServicePlanFormState = {
  planId: string | null
  planCode: string
  displayName: string
  basePriceMonthly: string
  includedStations: string
  perExtraStationPrice: string
  cardSurchargePct: string
  isActive: boolean
}

type BillableServiceFormState = {
  serviceId: string | null
  serviceCode: string
  displayName: string
  serviceCategory: BillableServiceRecord['service_category']
  pricingModel: BillableServiceRecord['pricing_model']
  basePriceMonthly: string
  additionalUnitPrice: string
  includedQuantity: string
  cardSurchargePct: string
  unitLabel: string
  isActive: boolean
}

type DeviceBillingMappingFormState = {
  deviceCategory: string
  serviceCode: string
  isActive: boolean
}

function planToFormState(plan?: SubscriptionPlanRecord | null): ServicePlanFormState {
  return {
    planId: plan?.id ?? null,
    planCode: plan?.plan_code ?? 'SERVICE_CATALOG',
    displayName: plan?.display_name ?? 'Dexa POS Base',
    basePriceMonthly: String(plan?.base_price_monthly ?? 99),
    includedStations: String(plan?.included_stations ?? 1),
    perExtraStationPrice: String(plan?.per_extra_station_price ?? 49),
    cardSurchargePct: String(plan?.card_surcharge_pct ?? 4),
    isActive: plan?.is_active ?? true,
  }
}

function serviceToFormState(service?: BillableServiceRecord | null): BillableServiceFormState {
  return {
    serviceId: service?.id ?? null,
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
    cardSurchargePct: String(service?.card_surcharge_pct ?? 4),
    unitLabel: service?.unit_label ?? 'unit',
    isActive: service?.is_active ?? true,
  }
}

function mappingToFormState(
  mapping?: DeviceBillingServiceMappingRecord | null,
  fallbackServiceCode = '',
): DeviceBillingMappingFormState {
  return {
    deviceCategory: mapping?.device_category ?? 'pos_tablet',
    serviceCode: mapping?.service_code ?? fallbackServiceCode,
    isActive: mapping?.is_active ?? true,
  }
}

function parseMoneyInput(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Number(parsed.toFixed(2))) : 0
}

function parsePercentInput(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(100, Math.max(0, Number(parsed.toFixed(4))))
}

function parsePositiveInteger(value: string | undefined): number {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.floor(parsed))
}

/**
 * HQ-global billing catalog editors — plan pricing, billable services/add-ons,
 * and device→service mappings. This config is platform-wide (not per-merchant),
 * so it lives on the HQ settings page rather than inside each merchant's flow.
 */
export function SubscriptionCatalogAdmin() {
  const [isPending, startTransition] = useTransition()
  const [services, setServices] = useState<BillableServiceRecord[]>([])
  const [servicePlans, setServicePlans] = useState<SubscriptionPlanRecord[]>([])
  const [deviceBillingMappings, setDeviceBillingMappings] = useState<DeviceBillingServiceMappingRecord[]>([])
  const [selectedServicePlanId, setSelectedServicePlanId] = useState('')
  const [servicePlanForm, setServicePlanForm] = useState<ServicePlanFormState>(() => planToFormState(null))
  const [selectedCatalogServiceId, setSelectedCatalogServiceId] = useState('')
  const [billableServiceForm, setBillableServiceForm] = useState<BillableServiceFormState>(() => serviceToFormState(null))
  const [selectedDeviceMappingCategory, setSelectedDeviceMappingCategory] = useState('pos_tablet')
  const [deviceMappingForm, setDeviceMappingForm] = useState<DeviceBillingMappingFormState>(() => mappingToFormState(null))

  const load = () => {
    startTransition(async () => {
      try {
        const [nextServices, nextServicePlans, nextMappings] = await Promise.all([
          getBillableServices(),
          getSubscriptionPlans(),
          getDeviceBillingServiceMappings(),
        ])

        setServices(nextServices)
        setServicePlans(nextServicePlans)
        setDeviceBillingMappings(nextMappings)

        const defaultServicePlan =
          nextServicePlans.find((plan) => plan.id === selectedServicePlanId) ??
          nextServicePlans.find((plan) => plan.plan_code === 'SERVICE_CATALOG') ??
          nextServicePlans[0] ??
          null
        setSelectedServicePlanId(defaultServicePlan?.id || '')
        setServicePlanForm(planToFormState(defaultServicePlan))

        const defaultCatalogService =
          nextServices.find((service) => service.id === selectedCatalogServiceId) ?? nextServices[0] ?? null
        setSelectedCatalogServiceId(defaultCatalogService?.id || '')
        setBillableServiceForm(serviceToFormState(defaultCatalogService))

        const defaultMappingCategory = selectedDeviceMappingCategory || 'pos_tablet'
        const defaultDeviceMapping =
          nextMappings.find((mapping) => mapping.device_category === defaultMappingCategory) ??
          nextMappings[0] ??
          null
        const fallbackServiceCode =
          nextServices.find((service) => service.service_code === defaultMappingCategory)?.service_code ??
          nextServices[0]?.service_code ??
          ''
        setSelectedDeviceMappingCategory(defaultDeviceMapping?.device_category ?? defaultMappingCategory)
        setDeviceMappingForm(mappingToFormState(defaultDeviceMapping, fallbackServiceCode))
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load billing catalog.')
      }
    })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const plan = servicePlans.find((item) => item.id === selectedServicePlanId)
    if (plan) setServicePlanForm(planToFormState(plan))
  }, [selectedServicePlanId, servicePlans])

  useEffect(() => {
    const service = services.find((item) => item.id === selectedCatalogServiceId)
    if (service) setBillableServiceForm(serviceToFormState(service))
  }, [selectedCatalogServiceId, services])

  useEffect(() => {
    const mapping = deviceBillingMappings.find(
      (item) => item.device_category === selectedDeviceMappingCategory,
    )
    const fallbackServiceCode =
      services.find((service) => service.service_code === selectedDeviceMappingCategory)?.service_code ??
      services[0]?.service_code ??
      ''
    setDeviceMappingForm(mappingToFormState(mapping, fallbackServiceCode))
  }, [selectedDeviceMappingCategory, deviceBillingMappings, services])

  const handleSaveServicePlan = () => {
    startTransition(async () => {
      const result = await upsertSubscriptionPlan({
        planId: servicePlanForm.planId,
        planCode: servicePlanForm.planCode.trim(),
        displayName: servicePlanForm.displayName.trim(),
        basePriceMonthly: parseMoneyInput(servicePlanForm.basePriceMonthly),
        includedStations: parsePositiveInteger(servicePlanForm.includedStations),
        perExtraStationPrice: parseMoneyInput(servicePlanForm.perExtraStationPrice),
        cardSurchargePct: parsePercentInput(servicePlanForm.cardSurchargePct),
        isActive: servicePlanForm.isActive,
        metadata: { source: 'hq_billing_catalog', pricingModel: 'service_catalog' },
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save subscription plan.')
        return
      }
      if (result.planId) setSelectedServicePlanId(result.planId)
      toast.success('Subscription plan pricing saved.')
      load()
    })
  }

  const handleSaveBillableService = () => {
    startTransition(async () => {
      const result = await upsertBillableService({
        serviceId: billableServiceForm.serviceId,
        serviceCode: billableServiceForm.serviceCode.trim(),
        displayName: billableServiceForm.displayName.trim(),
        serviceCategory: billableServiceForm.serviceCategory,
        pricingModel: billableServiceForm.pricingModel,
        basePriceMonthly: parseMoneyInput(billableServiceForm.basePriceMonthly),
        additionalUnitPrice:
          billableServiceForm.additionalUnitPrice.trim().length > 0
            ? parseMoneyInput(billableServiceForm.additionalUnitPrice)
            : null,
        includedQuantity: parsePositiveInteger(billableServiceForm.includedQuantity),
        cardSurchargePct: parsePercentInput(billableServiceForm.cardSurchargePct),
        unitLabel: billableServiceForm.unitLabel.trim() || 'unit',
        isActive: billableServiceForm.isActive,
        metadata: { source: 'hq_billing_catalog' },
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save billable service.')
        return
      }
      if (result.serviceId) setSelectedCatalogServiceId(result.serviceId)
      toast.success('Billable service pricing saved.')
      load()
    })
  }

  const handleSaveDeviceBillingMapping = () => {
    startTransition(async () => {
      const result = await upsertDeviceBillingServiceMapping({
        deviceCategory: deviceMappingForm.deviceCategory,
        serviceCode: deviceMappingForm.serviceCode,
        isActive: deviceMappingForm.isActive,
        metadata: { source: 'hq_billing_catalog' },
      })
      if (!result.success) {
        toast.error(result.error || 'Failed to save device billing mapping.')
        return
      }
      setSelectedDeviceMappingCategory(deviceMappingForm.deviceCategory)
      toast.success('Device billing mapping saved.')
      load()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing Catalog Controls</CardTitle>
        <CardDescription>
          Configure reusable plan prices, billable services, and device-to-service mappings. Changes affect future
          calculations; existing invoice snapshots remain unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Service Billing Plan</div>
              <p className="text-xs text-muted-foreground">
                Base station price, included stations, extra-station price, and card surcharge.
              </p>
            </div>
            <Badge variant={servicePlanForm.isActive ? 'default' : 'secondary'}>
              {servicePlanForm.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={selectedServicePlanId} onValueChange={setSelectedServicePlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  {servicePlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.display_name} ({plan.plan_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plan Code</Label>
              <Input
                value={servicePlanForm.planCode}
                onChange={(event) => setServicePlanForm((current) => ({ ...current, planCode: event.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Display Name</Label>
              <Input
                value={servicePlanForm.displayName}
                onChange={(event) => setServicePlanForm((current) => ({ ...current, displayName: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>First Station Price</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={servicePlanForm.basePriceMonthly}
                onChange={(event) =>
                  setServicePlanForm((current) => ({ ...current, basePriceMonthly: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Included Stations</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={servicePlanForm.includedStations}
                onChange={(event) =>
                  setServicePlanForm((current) => ({ ...current, includedStations: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Additional Station Price</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={servicePlanForm.perExtraStationPrice}
                onChange={(event) =>
                  setServicePlanForm((current) => ({ ...current, perExtraStationPrice: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Card Surcharge %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={servicePlanForm.cardSurchargePct}
                onChange={(event) =>
                  setServicePlanForm((current) => ({ ...current, cardSurchargePct: event.target.value }))
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={servicePlanForm.isActive}
              onCheckedChange={(checked) =>
                setServicePlanForm((current) => ({ ...current, isActive: Boolean(checked) }))
              }
            />
            Active plan
          </label>

          <Button onClick={handleSaveServicePlan} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Plan Pricing
          </Button>
        </div>

        <div className="min-w-0 space-y-4 border-t pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Billable Services & Add-ons</div>
              <p className="text-xs text-muted-foreground">
                Edit POS tablet, KDS, online ordering, loyalty, delivery integration, franchise, and future services.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCatalogServiceId('')
                setBillableServiceForm(serviceToFormState(null))
              }}
            >
              New Service
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={selectedCatalogServiceId} onValueChange={setSelectedCatalogServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.display_name} ({service.service_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Service Code</Label>
              <Input
                value={billableServiceForm.serviceCode}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, serviceCode: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Display Name</Label>
              <Input
                value={billableServiceForm.displayName}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={billableServiceForm.serviceCategory}
                onValueChange={(value) =>
                  setBillableServiceForm((current) => ({
                    ...current,
                    serviceCategory: value as BillableServiceRecord['service_category'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hardware">Hardware</SelectItem>
                  <SelectItem value="software">Software</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pricing Model</Label>
              <Select
                value={billableServiceForm.pricingModel}
                onValueChange={(value) =>
                  setBillableServiceForm((current) => ({
                    ...current,
                    pricingModel: value as BillableServiceRecord['pricing_model'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat</SelectItem>
                  <SelectItem value="per_unit">Per unit</SelectItem>
                  <SelectItem value="tiered">Tiered</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base Monthly Price</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={billableServiceForm.basePriceMonthly}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, basePriceMonthly: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Additional Unit Price</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={billableServiceForm.additionalUnitPrice}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, additionalUnitPrice: event.target.value }))
                }
                placeholder="Only for tiered pricing"
              />
            </div>
            <div className="space-y-2">
              <Label>Included Quantity</Label>
              <Input
                type="number"
                min={0}
                step="1"
                value={billableServiceForm.includedQuantity}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, includedQuantity: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Label</Label>
              <Input
                value={billableServiceForm.unitLabel}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, unitLabel: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Card Surcharge %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={billableServiceForm.cardSurchargePct}
                onChange={(event) =>
                  setBillableServiceForm((current) => ({ ...current, cardSurchargePct: event.target.value }))
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={billableServiceForm.isActive}
              onCheckedChange={(checked) =>
                setBillableServiceForm((current) => ({ ...current, isActive: Boolean(checked) }))
              }
            />
            Active service
          </label>

          <Button onClick={handleSaveBillableService} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Service Pricing
          </Button>
        </div>

        <div className="space-y-4 border-t pt-6 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Device Billing Mappings</div>
              <p className="text-xs text-muted-foreground">
                Controls which deployed device categories automatically adjust billable service quantities.
              </p>
            </div>
            <Badge variant={deviceMappingForm.isActive ? 'default' : 'secondary'}>
              {deviceMappingForm.isActive ? 'Active mapping' : 'Inactive mapping'}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Device Category</Label>
              <Select
                value={deviceMappingForm.deviceCategory}
                onValueChange={(value) => {
                  setSelectedDeviceMappingCategory(value)
                  setDeviceMappingForm((current) => ({ ...current, deviceCategory: value }))
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLABLE_DEVICE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Billable Service</Label>
              <Select
                value={deviceMappingForm.serviceCode}
                onValueChange={(value) => setDeviceMappingForm((current) => ({ ...current, serviceCode: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select billable service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.service_code}>
                      {service.display_name} ({service.service_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={deviceMappingForm.isActive}
                onCheckedChange={(checked) =>
                  setDeviceMappingForm((current) => ({ ...current, isActive: Boolean(checked) }))
                }
              />
              Active mapping
            </label>
            <div className="text-xs text-muted-foreground">
              Device assignment sync recalculates subscription quantities after deployed device changes.
            </div>
          </div>

          <Button onClick={handleSaveDeviceBillingMapping} disabled={isPending || !deviceMappingForm.serviceCode}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Device Mapping
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
