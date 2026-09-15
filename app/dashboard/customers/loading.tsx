import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function CustomersLoading() {
  return (
    <DataPageSkeleton
      variant="table"
      shell="plain"
      label="Loading the customer directory"
    />
  )
}
