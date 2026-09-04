import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

/**
 * Eight report tabs over a single body, and no KPI row — the tab's own
 * content supplies its figures, so a stat row here would promise tiles the
 * page never renders.
 */
export default function OrdersReportsLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      shell="plain"
      label="Loading order reports"
      report={{ stats: 0, tabs: 8, body: 'table' }}
    />
  )
}
