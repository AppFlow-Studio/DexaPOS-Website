import { SettingsSectionNav } from '@/components/dashboard/settings/SettingsSectionNav'
import { PageShell } from '@/components/dashboard/shell'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="pb-8">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <SettingsSectionNav />
        <div className="min-w-0 [&_[data-slot=card]]:rounded-3xl [&_[data-slot=card]]:shadow-none [&_[data-slot=card-header]]:px-4 [&_[data-slot=card-content]]:px-4 sm:[&_[data-slot=card-header]]:px-6 sm:[&_[data-slot=card-content]]:px-6 [&_[data-slot=card]_[data-slot=card]]:rounded-2xl">
          {children}
        </div>
      </div>
    </PageShell>
  )
}
