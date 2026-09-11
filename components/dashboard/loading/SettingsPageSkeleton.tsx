import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader, Panel } from '@/components/dashboard/shell'

type SettingsSkeletonVariant =
  | 'general'
  | 'billing'
  | 'loyalty'
  | 'prep-stations'
  | 'receipt-templates'
  | 'tips'
  | 'station-detail'

const TITLES: Record<SettingsSkeletonVariant, { title: string; subtitle?: string }> = {
  general: { title: 'General & tax', subtitle: 'Configure tax categories and rates for this location.' },
  billing: { title: 'Billing & payment method', subtitle: 'Manage your subscription billing payment method.' },
  loyalty: { title: 'Loyalty & rewards', subtitle: 'Create programs and promotions that reward returning customers.' },
  'prep-stations': { title: 'Prep stations', subtitle: 'Route menu items and categories to the correct KDS preparation area.' },
  'receipt-templates': { title: 'Receipt templates', subtitle: 'Preview and customize every receipt and kitchen ticket format.' },
  tips: { title: 'Tips', subtitle: 'Configure tip pools, role distribution, and tip-out rules.' },
  'station-detail': { title: 'Station details' },
}

function Heading({ action = false }: { action?: boolean }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-5 w-44 max-w-full rounded-full" />
        <Skeleton className="h-3 w-72 max-w-full rounded-full" />
      </div>
      {action && <Skeleton className="h-9 w-32 max-w-[45%] shrink-0 rounded-full" />}
    </div>
  )
}

function Rows({ count, height = 'h-12' }: { count: number; height?: string }) {
  return (
    <div className="min-w-0 space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={`${height} w-full max-w-full rounded-2xl`} />
      ))}
    </div>
  )
}

function Section({ action = false, children }: { action?: boolean; children: React.ReactNode }) {
  return (
    <Panel padded className="min-w-0 overflow-hidden">
      <div className="min-w-0 space-y-6">
        <Heading action={action} />
        {children}
      </div>
    </Panel>
  )
}

function Body({ variant }: { variant: SettingsSkeletonVariant }) {
  if (variant === 'general') {
    return <><Skeleton className="h-24 w-full rounded-2xl" /><Section><Rows count={6} /></Section></>
  }

  if (variant === 'billing') {
    return (
      <>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Section><Rows count={1} height="h-10" /></Section>
        <Section>
          <div className="grid min-w-0 gap-4 md:grid-cols-2 [&>*]:min-w-0"><Rows count={3} height="h-10" /><Rows count={3} height="h-10" /></div>
        </Section>
      </>
    )
  }

  if (variant === 'loyalty') {
    return <><Section action><Rows count={2} height="h-24" /></Section><Section action><Rows count={2} height="h-20" /></Section></>
  }

  if (variant === 'prep-stations') {
    return <Section action><Rows count={3} height="h-20" /></Section>
  }

  if (variant === 'tips') {
    return (
      <>
        <Section action><div className="grid min-w-0 gap-4 md:grid-cols-2 [&>*]:min-w-0"><Skeleton className="h-56 w-full rounded-2xl" /><Skeleton className="h-56 w-full rounded-2xl" /></div></Section>
        <Section action><div className="grid min-w-0 gap-4 md:grid-cols-2 [&>*]:min-w-0"><Skeleton className="h-40 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div></Section>
        <Section><Rows count={3} height="h-10" /></Section>
      </>
    )
  }

  if (variant === 'receipt-templates') {
    return (
      <>
        <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto"><Skeleton className="h-10 w-32 shrink-0 rounded-full" /><Skeleton className="h-10 w-36 shrink-0 rounded-full" /><Skeleton className="h-10 w-32 shrink-0 rounded-full" /></div>
        <div className="flex min-w-0 flex-col gap-6 lg:flex-row">
          <Skeleton className="h-[500px] w-full rounded-2xl lg:w-[380px] lg:shrink-0" />
          <Panel padded className="min-w-0 flex-1 overflow-hidden"><Rows count={7} height="h-10" /></Panel>
        </div>
      </>
    )
  }

  return (
    <>
      <Skeleton className="h-9 w-40 max-w-full rounded-full" />
      <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto"><Skeleton className="h-10 w-28 shrink-0 rounded-full" /><Skeleton className="h-10 w-28 shrink-0 rounded-full" /><Skeleton className="h-10 w-28 shrink-0 rounded-full" /></div>
      <Section><Rows count={5} height="h-16" /></Section>
    </>
  )
}

export function SettingsPageSkeleton({ variant }: { variant: SettingsSkeletonVariant }) {
  const copy = TITLES[variant]
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="min-w-0 space-y-6 overflow-x-hidden">
      <span className="sr-only">Loading {copy.title}</span>
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        indicator={variant === 'station-detail' ? undefined : <Skeleton className="h-8 w-36 max-w-full rounded-full" />}
        actions={['general', 'prep-stations'].includes(variant) ? <Skeleton className="h-9 w-36 max-w-full rounded-full" /> : undefined}
      />
      <Body variant={variant} />
    </div>
  )
}
