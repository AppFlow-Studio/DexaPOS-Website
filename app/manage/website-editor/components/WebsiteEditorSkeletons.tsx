import { PageShell, Panel } from "@/components/dashboard/shell";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * Loading states for the website editor, each drawn in the shape of the screen
 * it stands in for, at laptop and at phone width (UI-DESIGN-SYSTEM §4.10).
 * Pulsing blocks only, never a spinner. Every route's `loading.tsx` renders
 * the one skeleton for its screen.
 */

/** `PageHeader`: optional back pill, title, subtitle (hidden on phones unless it is scope), actions. */
function HeaderSkeleton({
  actions,
  back = false,
  indicator = false,
  subtitleOnMobile = false,
}: {
  actions: number;
  back?: boolean;
  indicator?: boolean;
  subtitleOnMobile?: boolean;
}) {
  return (
    <div>
      {back && <Skeleton className="h-8 w-32 rounded-full" />}
      <div className={back ? "mt-2 flex flex-wrap items-center justify-between gap-3" : "flex flex-wrap items-center justify-between gap-3"}>
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-52 max-w-full" />
          <Skeleton className={subtitleOnMobile ? "h-4 w-40" : "h-4 w-80 max-w-full max-sm:hidden"} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {indicator && <Skeleton className="h-6 w-20 rounded-full" />}
          {Array.from({ length: actions }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Pages / Categories / Content blocks rail. */
function RailSkeleton() {
  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="inline-flex w-max gap-0.5 rounded-full bg-muted/70 p-1">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
    </div>
  );
}

/** A `PanelSection` heading row: label, caption (dropped on phones) and an optional action. */
function SectionHeadSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-72 max-w-full max-sm:hidden" />
      </div>
      {action && <Skeleton className="h-9 w-36 rounded-full" />}
    </div>
  );
}

/** /manage/website-editor: toolbar, then the pages table from `md` and cards below. */
export function PagesListSkeleton() {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">Loading pages</p>
      <div className="space-y-6" aria-hidden>
        <HeaderSkeleton actions={2} />
        <RailSkeleton />
        <Panel padded>
          <div className="space-y-5">
            <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
              <Skeleton className="h-10 w-full rounded-full md:flex-1" />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Skeleton className="h-9 rounded-full sm:w-44" />
                <Skeleton className="h-9 rounded-full sm:w-36" />
              </div>
            </div>

            {/* Columns by tier, as the table: page, route, status from `md`;
                updated from `lg`; category from `xl`. */}
            <div className="hidden overflow-hidden rounded-2xl bg-muted/20 md:block">
              <div className="flex items-center gap-6 bg-muted/50 px-3 py-3">
                <Skeleton className="h-3.5 w-16 flex-1" />
                <Skeleton className="h-3.5 w-[28%]" />
                <Skeleton className="hidden h-3.5 w-28 xl:block" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="hidden h-3.5 w-24 lg:block" />
                <span className="w-6" />
              </div>
              <div className="space-y-px">
                {Array.from({ length: 10 }).map((_, row) => (
                  <div key={row} className="flex items-center gap-6 bg-card/70 px-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <Skeleton className="h-4 w-40 max-w-full" />
                    </div>
                    <Skeleton className="h-3.5 w-[28%]" />
                    <Skeleton className="hidden h-4 w-28 xl:block" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="hidden h-4 w-24 lg:block" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
              {Array.from({ length: 4 }).map((_, card) => (
                <div key={card} className="min-w-0 rounded-2xl bg-muted/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-5 w-40 max-w-[70%]" />
                    <Skeleton className="h-6 w-6 rounded-full" />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

/** A list screen of rounded record rows inside one panel section (categories, content blocks). */
function RowListSkeleton({ label, rows, trailing }: { label: string; rows: number; trailing: "actions" | "chevron" }) {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">{label}</p>
      <div className="space-y-6" aria-hidden>
        <HeaderSkeleton actions={1} />
        <RailSkeleton />
        <Panel>
          <div className="space-y-6 px-4 py-8 sm:px-6">
            <SectionHeadSkeleton action />
            <div className="space-y-2">
              {Array.from({ length: rows }).map((_, row) => (
                <div key={row} className="flex items-center gap-3 rounded-2xl bg-muted/45 py-3 pr-2 pl-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-36 max-w-full" />
                    <Skeleton className="h-3 w-48 max-w-full" />
                  </div>
                  {trailing === "actions" ? (
                    <>
                      <Skeleton className="size-8 rounded-full" />
                      <Skeleton className="size-8 rounded-full" />
                    </>
                  ) : (
                    <Skeleton className="mr-2 size-4 rounded-full" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

export function CategoriesSkeleton() {
  return <RowListSkeleton label="Loading categories" rows={6} trailing="actions" />;
}

export function BlocksSkeleton() {
  return <RowListSkeleton label="Loading content blocks" rows={5} trailing="chevron" />;
}

/** /manage/website-editor/pages/[route]: page details, then the content sections. */
export function PageEditorSkeleton() {
  return (
    <PageShell as="div">
      <p role="status" className="sr-only">Loading the page editor</p>
      <div className="space-y-6" aria-hidden>
        <HeaderSkeleton actions={3} back indicator subtitleOnMobile />

        <Panel>
          <div className="space-y-6 px-4 py-8 sm:px-6">
            <SectionHeadSkeleton />
            <div className="grid min-w-0 gap-5 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full rounded-full" />
                  <Skeleton className="h-3 w-44 max-w-full" />
                </div>
              ))}
              <div className="space-y-2 md:col-span-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <div className="space-y-6 px-4 py-8 sm:px-6">
            <SectionHeadSkeleton />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                  <Skeleton className="size-4 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-48 max-w-[40%]" />
                  <div className="ml-auto flex gap-1">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="size-8 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
