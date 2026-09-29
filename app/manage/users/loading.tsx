import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

/**
 * Shaped like the converted page (§14.4): three stat tiles, the two-tab pill
 * rail, then the panel holding the toolbar and table. The page renders the
 * same skeleton while its queries load, so the route and in-page states match.
 */
export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      report={{ stats: 3, tabs: 2, body: 'table' }}
      shell="plain"
      label="Loading the HQ user directory"
    />
  )
}
