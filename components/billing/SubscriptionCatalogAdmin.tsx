'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'

import { Panel, PanelSection, StatRow, StatTile } from '@/components/dashboard/shell'
import { PaginationBar } from '@/components/dashboard/PaginationBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import {
  CardField,
  CardFields,
  CardGridEmpty,
  LoadError,
  TableEmptyRow,
} from '@/app/manage/transactions/components/ledger-primitives'
import {
  getBillableServices,
  getDeviceBillingServiceMappings,
  getSubscriptionPlans,
  type BillableServiceRecord,
  type DeviceBillingServiceMappingRecord,
  type SubscriptionPlanRecord,
} from '@/app/manage/actions/subscription-billing'
import { useClientPagination } from '@/lib/hooks/useClientPagination'
import { cn, formatCurrency } from '@/lib/utils'
import { BillableServiceDialog } from './catalog/BillableServiceDialog'
import { MutedSelectTrigger } from './catalog/CatalogFormDialog'
import {
  CatalogPanelsSkeleton,
  CatalogTable,
  DEVICES_CAPTION,
  DEVICE_COLUMNS,
  SERVICES_CAPTION,
  SERVICE_COLUMNS,
} from './catalog/CatalogTable'
import { DeviceMappingDialog } from './catalog/DeviceMappingDialog'
import { PlanPricingDialog } from './catalog/PlanPricingDialog'
import {
  BILLABLE_DEVICE_CATEGORIES,
  PRICING_MODEL_LABELS,
  SERVICE_CATEGORY_LABELS,
  deviceCategoryLabel,
  formatPercent,
} from './catalog/catalog-format'

type Catalog = {
  plans: SubscriptionPlanRecord[]
  services: BillableServiceRecord[]
  mappings: DeviceBillingServiceMappingRecord[]
}

type DeviceRow = {
  category: string
  mapping: DeviceBillingServiceMappingRecord | null
  /** The service the mapping bills as; `null` when unmapped or the code is not in the catalog. */
  service: BillableServiceRecord | null
}

// Stable empties, so memos keyed on them do not recompute every render while loading.
const NO_PLANS: SubscriptionPlanRecord[] = []
const NO_SERVICES: BillableServiceRecord[] = []
const NO_MAPPINGS: DeviceBillingServiceMappingRecord[] = []

/**
 * HQ-global billing catalog — the station plan, billable services/add-ons,
 * and device→service mappings. Platform-wide (not per-merchant), so it lives
 * on the HQ settings route rather than inside each merchant's flow.
 *
 * A read view: every price is visible at once, and each record opens a
 * centred editor (UI-DESIGN-SYSTEM §12). Rendered inside the page's
 * `PageShell`, so each panel is one of its top-level blocks.
 */
export function SubscriptionCatalogAdmin() {
  const {
    data: catalog,
    error: loadError,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['hq-billing-catalog'],
    queryFn: async (): Promise<Catalog> => {
      const [plans, services, mappings] = await Promise.all([
        getSubscriptionPlans(),
        // Inactive services stay listed, so switching one off does not make it vanish.
        getBillableServices(true),
        getDeviceBillingServiceMappings(),
      ])
      return { plans, services, mappings }
    },
  })

  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [serviceDialog, setServiceDialog] = useState<{ open: boolean; service: BillableServiceRecord | null }>({
    open: false,
    service: null,
  })
  const [deviceDialog, setDeviceDialog] = useState<{ open: boolean; row: DeviceRow | null }>({
    open: false,
    row: null,
  })
  // Bumped on every open, and used as the editors' `key`: each open mounts a
  // fresh form seeded from the record, with no reset effect to keep in sync.
  const [editorSession, setEditorSession] = useState(0)

  const plans = catalog?.plans ?? NO_PLANS
  const services = catalog?.services ?? NO_SERVICES
  const mappings = catalog?.mappings ?? NO_MAPPINGS

  const plan =
    plans.find((item) => item.id === selectedPlanId) ??
    plans.find((item) => item.plan_code === 'SERVICE_CATALOG') ??
    plans[0] ??
    null

  const deviceRows = useMemo<DeviceRow[]>(() => {
    const known = new Set<string>(BILLABLE_DEVICE_CATEGORIES)
    // Categories with a mapping but outside the known list still get a row.
    const extra = mappings.map((m) => m.device_category).filter((c) => !known.has(c))
    return [...BILLABLE_DEVICE_CATEGORIES, ...extra].map((category) => {
      const mapping = mappings.find((m) => m.device_category === category) ?? null
      const service = mapping ? services.find((s) => s.service_code === mapping.service_code) ?? null : null
      return { category, mapping, service }
    })
  }, [mappings, services])

  const servicePage = useClientPagination(services, 10)
  const devicePage = useClientPagination(deviceRows, 10)

  // §4.10: the catalog's own skeleton, the same one the route's loading.tsx shows.
  if (isLoading) return <CatalogPanelsSkeleton />

  // The first load failed (§4.9: a worded error with Retry, never red text).
  // A failed refetch after a save keeps the last good catalog on screen.
  if (!catalog) {
    return (
      <Panel padded>
        <LoadError
          title="We hit a snag loading the billing catalog"
          detail={loadError?.message}
          onRetry={() => void refetch()}
        />
      </Panel>
    )
  }

  const activeServices = services.filter((service) => service.is_active).length
  const mappedDevices = deviceRows.filter((row) => row.mapping).length

  const openPlan = () => {
    setEditorSession((session) => session + 1)
    setPlanDialogOpen(true)
  }
  const openService = (service: BillableServiceRecord | null) => {
    setEditorSession((session) => session + 1)
    setServiceDialog({ open: true, service })
  }
  const openDevice = (row: DeviceRow) => {
    setEditorSession((session) => session + 1)
    setDeviceDialog({ open: true, row })
  }

  return (
    <>
      {/* ── Station plan ─────────────────────────────────────────────── */}
      <Panel>
        <PanelSection
          label="Station plan"
          // The plan's name, code and state say which plan the figures belong to — scope, so it stays on phones.
          caption={
            plan ? (
              <>
                {plan.display_name} · <span className="font-mono text-xs">{plan.plan_code}</span>
                {!plan.is_active && ' · Inactive'}
              </>
            ) : undefined
          }
          showCaptionOnMobile
          action={
            plan && (
              <div className="flex flex-wrap items-center gap-2">
                {plans.length > 1 && (
                  <Select value={plan.id} onValueChange={setSelectedPlanId}>
                    {/* Height comes from the trigger's own `data-[size]` rule; phones get a 44px target (§13.6). */}
                    <MutedSelectTrigger aria-label="Plan" className="text-[0.8125rem] max-sm:min-h-11 sm:w-56">
                      <SelectValue />
                    </MutedSelectTrigger>
                    <SelectContent>
                      {plans.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.display_name}
                          {!item.is_active && ' · Inactive'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-4 text-[0.8125rem] font-medium shadow-sm max-sm:h-11"
                  onClick={openPlan}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit pricing
                </Button>
              </div>
            )
          }
        >
          {plan ? (
            // "Per month" is the figure's unit, so it stays on phones (§13.4).
            <StatRow columns={4}>
              <StatTile
                label="Base price"
                value={formatCurrency(Number(plan.base_price_monthly))}
                meta="Per month"
                showMetaOnMobile
              />
              <StatTile label="Included stations" value={Number(plan.included_stations)} meta="In the base price" />
              <StatTile
                label="Each extra station"
                value={formatCurrency(Number(plan.per_extra_station_price))}
                meta="Per month"
                showMetaOnMobile
              />
              <StatTile
                label="Card surcharge"
                value={formatPercent(Number(plan.card_surcharge_pct))}
                meta="On card payments"
              />
            </StatRow>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
              <p className="text-sm font-medium">No station plan yet</p>
              <p className="text-xs text-muted-foreground">
                Create one to set the base price, included stations, extra-station price and card surcharge.
              </p>
              <Button size="sm" className="mt-3 h-9 px-4 max-sm:h-11" onClick={openPlan}>
                Create plan
              </Button>
            </div>
          )}
        </PanelSection>
      </Panel>

      {/* ── Services & add-ons ───────────────────────────────────────── */}
      <Panel>
        <PanelSection
          label="Services & add-ons"
          caption={SERVICES_CAPTION}
          action={
            <Button
              size="sm"
              className="h-9 px-4 text-[0.8125rem] font-medium max-sm:h-11"
              onClick={() => openService(null)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New service
            </Button>
          }
        >
          {/* §5.3: the table from `md`, its columns joining by tier (SERVICE_COLUMNS); one line per row (§5.7). */}
          <CatalogTable columns={SERVICE_COLUMNS}>
            {services.length === 0 ? (
              <TableEmptyRow
                colSpan={Object.keys(SERVICE_COLUMNS).length}
                title="No billable services yet"
                hint="Add POS tablets, KDS, online ordering and other add-ons with New service."
              />
            ) : (
              servicePage.pageRows.map((service) => {
                const category = SERVICE_CATEGORY_LABELS[service.service_category] ?? service.service_category
                const pricing = PRICING_MODEL_LABELS[service.pricing_model] ?? service.pricing_model
                return (
                  <TableRow key={service.id} className="cursor-pointer" onClick={() => openService(service)}>
                    {/* The code has its own column from `2xl`; below that it is in the tooltip. */}
                    <TableCell className="truncate font-medium" title={`${service.display_name} · ${service.service_code}`}>
                      {service.display_name}
                    </TableCell>
                    <TableCell className={cn(SERVICE_COLUMNS.category.className, 'truncate')}>{category}</TableCell>
                    <TableCell
                      className={cn(SERVICE_COLUMNS.code.className, 'truncate font-mono text-xs text-muted-foreground')}
                      title={service.service_code}
                    >
                      {service.service_code}
                    </TableCell>
                    <TableCell className={cn(SERVICE_COLUMNS.pricing.className, 'truncate')}>{pricing}</TableCell>
                    <TableCell className={cn(SERVICE_COLUMNS.monthly.className, 'tabular-nums')}>
                      {formatCurrency(service.base_price_monthly)}
                    </TableCell>
                    <TableCell className={cn(SERVICE_COLUMNS.included.className, 'tabular-nums')}>
                      {service.included_quantity}
                    </TableCell>
                    <TableCell
                      className={cn(SERVICE_COLUMNS.extra.className, 'truncate tabular-nums')}
                      title={extraUnitPrice(service)}
                    >
                      {extraUnitPrice(service)}
                    </TableCell>
                    <TableCell className={cn(SERVICE_COLUMNS.surcharge.className, 'tabular-nums')}>
                      {formatPercent(service.card_surcharge_pct)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{service.is_active ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full p-0"
                        aria-label={`Edit ${service.display_name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          openService(service)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </CatalogTable>

          {/*
            §5.3 below `md`: record cards with the table's essentials only — name,
            status and the monthly price. The editor the card opens shows the rest.
          */}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {services.length === 0 ? (
              <CardGridEmpty
                title="No billable services yet"
                hint="Add POS tablets, KDS, online ordering and other add-ons with New service."
              />
            ) : (
              servicePage.pageRows.map((service) => (
                <RecordShell key={service.id} label={`Edit ${service.display_name}`} onOpen={() => openService(service)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{service.display_name}</p>
                    {/* Values on the tinted card are plain text, not pills (§3.5). */}
                    <p className="shrink-0 text-sm text-muted-foreground">{service.is_active ? 'Active' : 'Inactive'}</p>
                  </div>
                  <CardFields>
                    <CardField label="Monthly" value={formatCurrency(service.base_price_monthly)} />
                  </CardFields>
                </RecordShell>
              ))
            )}
          </div>

          <PaginationBar pagination={servicePage.pagination} onPageChange={servicePage.setPage} itemLabel="services" />
          {/* The pager hides when everything fits on one page; the count still shows (§5.2). */}
          {services.length > 0 && servicePage.pagination.totalPages <= 1 && (
            <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
              {services.length} {services.length === 1 ? 'service' : 'services'} · {activeServices} active
            </p>
          )}
        </PanelSection>
      </Panel>

      {/* ── Device billing ───────────────────────────────────────────── */}
      <Panel>
        <PanelSection label="Device billing" caption={DEVICES_CAPTION}>
          {/* §5.3: every column is essential, so the table shows whole from `md`. */}
          <CatalogTable columns={DEVICE_COLUMNS}>
            {devicePage.pageRows.map((row) => {
              const label = deviceCategoryLabel(row.category)
              return (
                <TableRow key={row.category} className="cursor-pointer" onClick={() => openDevice(row)}>
                  <TableCell className="truncate font-medium">{label}</TableCell>
                  <TableCell>
                    <BilledAs row={row} />
                  </TableCell>
                  <TableCell>
                    {row.mapping ? (
                      <Badge variant="outline">{row.mapping.is_active ? 'Active' : 'Inactive'}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full p-0"
                      aria-label={row.mapping ? `Edit ${label} billing` : `Map ${label}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        openDevice(row)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </CatalogTable>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
            {devicePage.pageRows.map((row) => {
              const label = deviceCategoryLabel(row.category)
              return (
                <RecordShell
                  key={row.category}
                  label={row.mapping ? `Edit ${label} billing` : `Map ${label}`}
                  onOpen={() => openDevice(row)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{label}</p>
                    <p className="shrink-0 text-sm text-muted-foreground">
                      {row.mapping ? (row.mapping.is_active ? 'Active' : 'Inactive') : 'Not mapped'}
                    </p>
                  </div>
                  {row.mapping && (
                    <div className="mt-3 min-w-0 text-sm">
                      <p className="text-xs text-muted-foreground">Billed as</p>
                      <BilledAs row={row} />
                    </div>
                  )}
                </RecordShell>
              )
            })}
          </div>

          <PaginationBar pagination={devicePage.pagination} onPageChange={devicePage.setPage} itemLabel="devices" />
          {devicePage.pagination.totalPages <= 1 && (
            <p className="mt-4 text-xs text-muted-foreground tabular-nums sm:text-sm">
              {deviceRows.length} device {deviceRows.length === 1 ? 'category' : 'categories'} · {mappedDevices} mapped
            </p>
          )}
        </PanelSection>
      </Panel>

      <PlanPricingDialog
        key={`plan-${editorSession}`}
        open={planDialogOpen}
        plan={plan}
        onOpenChange={setPlanDialogOpen}
        onSaved={(planId) => {
          if (planId) setSelectedPlanId(planId)
          setPlanDialogOpen(false)
          void refetch()
        }}
      />
      <BillableServiceDialog
        key={`service-${editorSession}`}
        open={serviceDialog.open}
        service={serviceDialog.service}
        onOpenChange={(open) => setServiceDialog((current) => ({ ...current, open }))}
        onSaved={() => {
          setServiceDialog((current) => ({ ...current, open: false }))
          void refetch()
        }}
      />
      {deviceDialog.row && (
        <DeviceMappingDialog
          key={`device-${editorSession}`}
          open={deviceDialog.open}
          deviceCategory={deviceDialog.row.category}
          mapping={deviceDialog.row.mapping}
          services={services}
          onOpenChange={(open) => setDeviceDialog((current) => ({ ...current, open }))}
          onSaved={() => {
            setDeviceDialog((current) => ({ ...current, open: false }))
            void refetch()
          }}
        />
      )}
    </>
  )
}

/** `$10.00 / tablet`, or `—` when the service has no per-unit price. */
function extraUnitPrice(service: BillableServiceRecord): string {
  if (service.additional_unit_price === null) return '—'
  return `${formatCurrency(service.additional_unit_price)} / ${service.unit_label || 'unit'}`
}

function BilledAs({ row }: { row: DeviceRow }) {
  if (!row.mapping) return <span className="text-muted-foreground">Not mapped</span>
  if (!row.service) {
    // The mapping names a code the catalog no longer has — say so rather than show a bare slug.
    return (
      <span className="block truncate">
        <span className="font-mono text-xs">{row.mapping.service_code}</span>
        <span className="text-muted-foreground"> · not in catalog</span>
      </span>
    )
  }
  return (
    <span className="block truncate">
      {row.service.display_name}
      {!row.service.is_active && <span className="text-muted-foreground"> · inactive service</span>}
    </span>
  )
}

/**
 * A record card that opens its editor. The whole card is one stretched
 * button (§5.3: a clickable card is a real `<button>`), with the content
 * laid over it as plain text.
 */
function RecordShell({
  label,
  onOpen,
  children,
}: {
  label: string
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <div className="relative min-w-0 rounded-2xl border-0 bg-muted/45 p-4 transition-colors hover:bg-muted">
      <button
        type="button"
        aria-label={label}
        onClick={onOpen}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative">{children}</div>
    </div>
  )
}
