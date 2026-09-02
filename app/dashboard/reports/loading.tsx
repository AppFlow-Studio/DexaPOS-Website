import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      shell="plain"
      label="Loading reports"
      report={{ stats: 4, body: 'chart' }}
    />
  )
}
