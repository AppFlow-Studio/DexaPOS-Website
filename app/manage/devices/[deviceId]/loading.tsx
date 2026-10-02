import { DeviceDetailSkeleton } from '@/app/manage/devices/components/skeletons'

/** The page's own skeleton (§4.10): the same one its Suspense fallback and in-page state render. */
export default function DeviceDetailLoading() {
  return <DeviceDetailSkeleton />
}
