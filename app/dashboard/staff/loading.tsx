import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function StaffLoading() {
  return (
    <DataPageSkeleton
      variant="table"
      shell="plain"
      label="Loading staff and access"
    />
  )
}
