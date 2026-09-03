import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="financials"
      shell="plain"
      label="Loading financial information"
    />
  )
}
