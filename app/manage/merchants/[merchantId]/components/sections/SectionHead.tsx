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
        <div className="mb-4 flex items-end justify-between border-b pb-3">
            <div>
                <h2 className=" text-[22px] leading-tight tracking-[-0.015em] text-foreground">
                    {title}
                </h2>
                {sub && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    )
}
