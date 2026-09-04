import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="stations"
      shell="plain"
      label="Loading stations"
    />
  )
}
