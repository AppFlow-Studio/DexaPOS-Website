import { ReactNode } from 'react'

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
        <div className="mb-4 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                <h2 className="text-[22px] leading-tight tracking-[-0.015em] text-foreground">
                    {title}
                </h2>
                {sub && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    )
}
