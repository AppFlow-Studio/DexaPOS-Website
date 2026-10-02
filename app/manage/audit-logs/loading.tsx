import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

/**
 * Shaped like the page (§14.4): header, the two-tab pill rail, then the panel
 * holding the toolbar and table. The page shows the same skeleton while it
 * reads its URL state, so the route and in-page states match.
 */
export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      report={{ stats: 0, tabs: 2, body: 'table' }}
      shell="plain"
      label="Loading the audit log"
    />
  )
}
