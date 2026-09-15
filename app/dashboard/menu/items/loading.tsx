import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton variant="catalog" shell="plain" label="Loading the item library" />
  )
}
