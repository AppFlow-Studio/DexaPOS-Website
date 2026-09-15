import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton variant="table" shell="plain" label="Loading support tickets" />
  )
}
