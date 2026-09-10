import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

export default function InvoicesLoading() {
  return (
    <DataPageSkeleton variant="table" shell="plain" label="Loading invoices" />
  )
}
