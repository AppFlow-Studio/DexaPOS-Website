import { KdsMirrorSkeleton } from "./components/KdsMirrorSkeleton";

/**
 * Without its own boundary this route inherits `/manage/support/loading.tsx`,
 * which draws the support inbox — a different page's shape.
 */
export default function KdsMirrorLoading() {
  return <KdsMirrorSkeleton />;
}
