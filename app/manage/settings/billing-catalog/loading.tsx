import { PageShell } from '@/components/dashboard/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { CatalogPanelsSkeleton } from '@/components/billing/catalog/CatalogTable'

/**
 * Shaped like the billing catalog at every width (UI-DESIGN-SYSTEM §4.10):
 * the header, then the same three panels the page shows while its catalog
 * query loads, so the route and in-page states match.
 */
export default function RouteLoading() {
  return (
    <PageShell as="div">
      <div aria-hidden className="min-w-0 space-y-2">
        <Skeleton className="h-8 w-44" />
        {/* The subtitle drops below `sm`, as PageHeader's does (§13.4). */}
        <Skeleton className="h-4 w-full max-w-xl max-sm:hidden" />
      </div>
      <CatalogPanelsSkeleton />
    </PageShell>
  )
}
