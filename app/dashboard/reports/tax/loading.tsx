import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="report"
      shell="plain"
      label="Loading the tax report"
      report={{ stats: 0, body: 'table' }}
    />
  )
}
