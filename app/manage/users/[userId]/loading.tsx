import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function RouteLoading() {
  return (
    <DataPageSkeleton variant="detail" shell="plain" label="Loading the user profile" />
  )
}
