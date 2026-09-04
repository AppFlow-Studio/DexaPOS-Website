import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="media-gallery"
      shell="plain"
      label="Loading the customer display gallery"
    />
  )
}
