import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton
      variant="pos-settings"
      shell="plain"
      label="Loading POS defaults"
    />
  )
}
