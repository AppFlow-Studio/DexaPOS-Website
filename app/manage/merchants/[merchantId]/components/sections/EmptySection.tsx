import { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * The §4.9 empty (or error) sentence for a merchant-detail section. Sits inside
 * the tab's `PanelSection` as a neutral well — never its own bordered box.
 */
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
        <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 py-10 text-center">
            <Icon className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
            {cta && <div className="mt-3">{cta}</div>}
        </div>
    )
}
