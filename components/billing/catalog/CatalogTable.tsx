'use client'

import { Panel, PanelSection, StatRow, StatTile } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { BILLABLE_DEVICE_CATEGORIES } from './catalog-format'

/*
 * The catalog's two lists and their loading shape (UI-DESIGN-SYSTEM §4.10,
 * §5.3, §5.7). Each column's tier and width is declared once and applied to
 * its header, its cells and its skeleton cells, so the three cannot drift.
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

type CatalogColumn = { label: string; className: string; srOnly?: boolean }

/**
 * Service columns by tier (§5.3). The essentials, shown from `md`, are the
 * phone card's fields: service, monthly price and status, plus the edit
 * control. Pricing model and extra-unit price join at `lg`, included quantity
 * at `xl`, category and code at `2xl`. Fixed widths let `table-fixed` truncate
 * the name rather than scroll sideways. No card-surcharge column: the
 * surcharge is one platform-wide rate, not per service.
 */
export const SERVICE_COLUMNS = {
  service: { label: 'Service', className: '' },
  category: { label: 'Category', className: 'hidden w-24 2xl:table-cell' },
  code: { label: 'Code', className: 'hidden w-44 2xl:table-cell' },
  pricing: { label: 'Pricing', className: 'hidden w-24 lg:table-cell' },
  monthly: { label: 'Monthly', className: 'w-28 text-right' },
  included: { label: 'Included', className: 'hidden w-24 text-right xl:table-cell' },
  extra: { label: 'Extra unit', className: 'hidden w-36 text-right lg:table-cell' },
  status: { label: 'Status', className: 'w-24' },
  actions: { label: 'Actions', className: 'w-12', srOnly: true },
} satisfies Record<string, CatalogColumn>

/** Every device column is essential: device, what it bills as, status, edit. */
export const DEVICE_COLUMNS = {
  device: { label: 'Device', className: '' },
  billedAs: { label: 'Billed as', className: '' },
  status: { label: 'Status', className: 'w-24' },
  actions: { label: 'Actions', className: 'w-12', srOnly: true },
} satisfies Record<string, CatalogColumn>

export const SERVICES_CAPTION =
  "Hardware, software and services billed on each location's subscription. Inactive services stay listed so they can be switched back on."

export const DEVICES_CAPTION =
  "Which service each deployed device adds to a location's subscription. Quantities recalculate when devices are assigned or removed."

/**
 * The table from `md`; record cards take over below (§5.3). Paged at 10 by
 * the caller, so it never scrolls inside itself (§5.7, `bounded={false}`).
 */
export function CatalogTable({
  columns,
  children,
}: {
  columns: Record<string, CatalogColumn>
  children: React.ReactNode
}) {
  return (
    <Table variant="data" bounded={false} containerClassName="hidden md:block" className="table-fixed">
      <TableHeader>
        <TableRow>
          {Object.entries(columns).map(([id, column]) => (
            <TableHead key={id} className={column.className}>
              {column.srOnly ? <span className="sr-only">{column.label}</span> : column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  )
}

/** A short pulsing bar that can sit inside a `<p>` (a caption or a stat meta). */
function InlineBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-3 max-w-full animate-pulse rounded-md bg-accent align-middle', className)}
    />
  )
}

/** One list's loading shape: its table well from `md`, its record cards below. */
function ListSkeleton({ columns, rows }: { columns: Record<string, CatalogColumn>; rows: number }) {
  return (
    <div aria-hidden>
      <CatalogTable columns={columns}>
        {Array.from({ length: rows }).map((_, row) => (
          <TableRow key={row}>
            {Object.entries(columns).map(([id, column], index) => (
              <TableCell key={id} className={column.className}>
                {id === 'actions' ? (
                  <Skeleton className="ml-auto h-8 w-8 rounded-full" />
                ) : id === 'status' ? (
                  <Skeleton className="h-5 w-16 rounded-full" />
                ) : (
                  <Skeleton className={index === 0 ? 'h-4 w-3/4' : 'h-4 w-full'} />
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </CatalogTable>

      {/* The card: its lead line (name and status), then one label/value pair. */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
        {Array.from({ length: Math.min(rows, 4) }).map((_, card) => (
          <div key={card} className="min-w-0 rounded-2xl bg-muted/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-14" />
            </div>
            <div className="mt-3 space-y-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The catalog's three panels while it loads, in their final shape. Used by
 * the route's `loading.tsx` and by the page's own loading state, so the shape
 * never jumps between the two (§4.10).
 */
export function CatalogPanelsSkeleton() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading the billing catalog
      </p>

      <Panel>
        <PanelSection
          label="Station plan"
          caption={<InlineBar className="w-48" />}
          showCaptionOnMobile
          action={<Skeleton className="h-9 w-32 rounded-full max-sm:h-11" />}
        >
          <StatRow columns={4}>
            <StatTile label="Base price" value="—" isLoading meta={<InlineBar className="w-16" />} showMetaOnMobile />
            <StatTile label="Included stations" value="—" isLoading meta={<InlineBar className="w-24" />} />
            <StatTile label="Each extra station" value="—" isLoading meta={<InlineBar className="w-16" />} showMetaOnMobile />
            <StatTile label="Card surcharge" value="—" isLoading meta={<InlineBar className="w-28" />} />
          </StatRow>
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection
          label="Services & add-ons"
          caption={SERVICES_CAPTION}
          action={<Skeleton className="h-9 w-32 rounded-full max-sm:h-11" />}
        >
          <ListSkeleton columns={SERVICE_COLUMNS} rows={6} />
        </PanelSection>
      </Panel>

      <Panel>
        <PanelSection label="Device billing" caption={DEVICES_CAPTION}>
          <ListSkeleton columns={DEVICE_COLUMNS} rows={BILLABLE_DEVICE_CATEGORIES.length} />
        </PanelSection>
      </Panel>
    </>
  )
}
