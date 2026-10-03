import { PageShell, Panel } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Loading states for /manage/settings/integrations and /manage/nmi-integration
 * (§4.10): skeleton D, one panel per integration, built from the same
 * `PageShell as="div" width="narrow"` and `Panel` as the pages so nothing
 * shifts when they land. Captions are hidden below `sm`, as on the pages,
 * where they sit behind an info icon beside the heading.
 */

/** A `PanelSection`: brand heading, caption (hidden below `sm`), then its body. */
function SectionBones({
  headingWidth = 'w-56',
  children,
}: {
  headingWidth?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 px-4 py-8 sm:px-6">
      <Skeleton className={cn('h-5 max-w-full', headingWidth)} />
      <div className="mt-2 space-y-1.5 max-sm:hidden">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="mt-5 min-w-0">{children}</div>
    </div>
  )
}

/** The muted `StatusWell`: a term over a value per item. */
function WellBones({ items, className }: { items: number; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-muted/60 px-4 py-4 sm:grid-cols-4',
        className
      )}
    >
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="min-w-0 space-y-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-4 w-24 max-w-full" />
        </div>
      ))}
    </div>
  )
}

/** A `Field`: label over a pill input. */
function FieldBones({ className }: { className?: string }) {
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  )
}

/** The submit row: full-width 44px on phones, right-aligned from `sm`. */
function SubmitBones({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center sm:justify-end', className)}>
      <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-44" />
    </div>
  )
}

/** A rail panel: what is saved, then the credentials form. */
function RailPanelBones({ fields, fullFirstField = false }: { fields: number; fullFirstField?: boolean }) {
  return (
    <Panel>
      <SectionBones>
        <WellBones items={4} />
      </SectionBones>
      <SectionBones headingWidth="w-28">
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: fields }, (_, index) => (
            <FieldBones key={index} className={cn(fullFirstField && index === 0 && 'md:col-span-2')} />
          ))}
          <SubmitBones className="md:col-span-2" />
        </div>
      </SectionBones>
    </Panel>
  )
}

function CutoverPanelBones() {
  return (
    <Panel>
      <SectionBones headingWidth="w-60">
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-0.5 size-4 shrink-0" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-40" />
            <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-32" />
          </div>
        </div>
      </SectionBones>
    </Panel>
  )
}

function OrderOutPanelBones() {
  return (
    <Panel>
      <SectionBones headingWidth="w-64">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl bg-muted/60 px-4 py-4 sm:grid-cols-3">
            <div className="col-span-2 min-w-0 space-y-2 sm:col-span-3">
              <Skeleton className="h-3.5 w-16" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="min-w-0 space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-28 max-w-full" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <Skeleton className="h-3.5 min-w-0 flex-1 basis-64" />
            <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-44" />
          </div>
        </div>
      </SectionBones>
    </Panel>
  )
}

/** `PageHeader`: the title's 42px line box, then the subtitle (hidden below `sm`). */
function HeaderBones({ titleWidth }: { titleWidth: string }) {
  return (
    <div className="min-w-0">
      <div className="flex h-[2.625rem] items-center">
        <Skeleton className={cn('h-8 max-w-[70vw]', titleWidth)} />
      </div>
      <Skeleton className="mt-1 h-4 w-96 max-w-[80vw] max-sm:hidden" />
    </div>
  )
}

export function IntegrationsSkeleton() {
  return (
    <PageShell as="div" width="narrow">
      <p role="status" className="sr-only">
        Loading integrations
      </p>
      <div aria-hidden className="min-w-0 space-y-6">
        <HeaderBones titleWidth="w-44" />
        <RailPanelBones fields={3} fullFirstField />
        <CutoverPanelBones />
        <RailPanelBones fields={4} />
        <OrderOutPanelBones />
      </div>
    </PageShell>
  )
}

export function NmiIntegrationSkeleton() {
  return (
    <PageShell as="div" width="narrow">
      <p role="status" className="sr-only">
        Loading the NMI integration
      </p>
      <div aria-hidden className="min-w-0 space-y-6">
        <HeaderBones titleWidth="w-56" />
        <RailPanelBones fields={4} />
      </div>
    </PageShell>
  )
}
