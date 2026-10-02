import { PageShell, Panel } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/manage/support/new`: skeleton D (§2) — back pill, header, the platform-scope
 * callout, then one padded panel holding the form.
 *
 * Without this file the parent `support/loading.tsx` (the inbox skeleton) shows
 * on this route. Built from the same `PageShell as="div" width="narrow"` and
 * `Panel padded` as the page so nothing shifts when it lands (§14.4).
 */

/** A label bone over a field bone. */
function FieldBones({ labelWidth = "w-20" }: { labelWidth?: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <Skeleton className={`h-3.5 ${labelWidth}`} />
      <Skeleton className="h-9 w-full rounded-full" />
    </div>
  );
}

export default function RouteLoading() {
  return (
    <PageShell as="div" width="narrow">
      <div role="status" aria-live="polite" aria-busy="true" className="min-w-0 space-y-6">
        <span className="sr-only">Loading the new ticket form</span>

        {/* Header — back pill, title (h1 line box is 42px), subtitle hidden below `sm`. */}
        <div className="min-w-0">
          <Skeleton className="h-8 w-36 rounded-full" />
          <div className="mt-2 flex h-[2.625rem] items-center">
            <Skeleton className="h-8 w-72 max-w-[70vw]" />
          </div>
          <Skeleton className="mt-2 h-4 w-96 max-w-[80vw] max-sm:hidden" />
        </div>

        {/* Callout — the real muted well, with bones for its icon and copy. */}
        <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-4 py-3">
          <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>

        <Panel padded>
          <div className="space-y-6">
            {/* Category + priority. */}
            <div className="grid min-w-0 gap-5 sm:grid-cols-2">
              <FieldBones />
              <FieldBones />
            </div>

            {/* Assignees, subject — each with a help line. */}
            <div className="space-y-2">
              <FieldBones labelWidth="w-32" />
              <Skeleton className="h-4 w-full max-w-lg" />
            </div>
            <div className="space-y-2">
              <FieldBones labelWidth="w-16" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>

            {/* Description textarea (`min-h-48`). */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-48 w-full rounded-2xl" />
            </div>

            {/* Attachments — help line, then the drop zone. */}
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-[5.5rem] w-full rounded-2xl" />
            </div>

            {/* Footer — stacked full-width 44px buttons on phones, a row from `sm`. */}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-24" />
              <Skeleton className="h-11 w-full rounded-full sm:h-9 sm:w-52" />
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
