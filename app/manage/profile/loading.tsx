import { PageShell } from '@/components/dashboard/shell'
import { DataPageSkeleton } from '@/components/dashboard/loading/DataPageSkeleton'

/**
 * Shaped like the page (§14.4). `shell="plain"` avoids a second `<main>`, so
 * the narrow width comes from a `PageShell as="div"` here — otherwise the
 * skeleton spans the full width and the page visibly narrows when it lands.
 */
export default function RouteLoading() {
  return (
    <PageShell as="div" width="narrow">
      <DataPageSkeleton variant="profile" shell="plain" label="Loading your profile" />
    </PageShell>
  )
}
