import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptySection({
    icon: Icon,
    title,
    body,
    cta,
}: {
    icon: LucideIcon
    title: string
    body: string
    cta?: ReactNode
}) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-16 text-center">
            <Icon className="mb-3 h-7 w-7 text-muted-foreground/60" />
            <p className="text-[13px] font-medium text-foreground">{title}</p>
            <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">{body}</p>
            {cta && <div className="mt-4">{cta}</div>}
        </div>
    )
}
