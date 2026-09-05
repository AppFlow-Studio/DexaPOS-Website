import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      shell="plain"
      label="Loading sales by item"
      report={{ stats: 4, body: 'table' }}
    />
  )
}
