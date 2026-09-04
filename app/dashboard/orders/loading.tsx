import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

/**
 * Route-transition skeleton. Without this, navigating into the route shows a
 * generic spinner until the page component mounts — the page's own loading
 * gate cannot help, because it runs after that point.
 */
export default function OrdersLoading() {
  return (
    <DataPageSkeleton variant="orders" shell="plain" label="Loading orders" />
  )
}
