import { ReactNode } from 'react'

/**
 * Legacy tab heading. New and converted tabs use `Panel > PanelSection`
 * instead; this remains only for importers that have not moved yet. No rule
 * under the heading (§5.5) and the §3.2 section-heading type.
 */
export function SectionHead({
    title,
    sub,
    actions,
}: {
    title: string
    sub?: string
    actions?: ReactNode
}) {
    return (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
                <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">{title}</h2>
                {sub && <p className="mt-1 text-sm text-muted-foreground max-sm:hidden">{sub}</p>}
            </div>
            {actions && <div className="flex min-w-0 max-w-full items-center gap-2">{actions}</div>}
        </div>
    )
}
