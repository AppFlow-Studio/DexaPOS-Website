import { InventoryPageSkeleton } from '@/app/manage/devices/components/skeletons'

/** The page's own skeleton (§4.10): the same one its Suspense fallback renders. */
export default function DevicesLoading() {
  return <InventoryPageSkeleton />
}
