import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      shell="plain"
      label="Loading the online ordering report"
      report={{ stats: 6, body: 'chart' }}
    />
  )
}
