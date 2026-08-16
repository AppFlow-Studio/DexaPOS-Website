import { SettingsSectionNav } from '@/components/dashboard/settings/SettingsSectionNav'
import { PageShell } from '@/components/dashboard/shell'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="pb-8">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <SettingsSectionNav />
        {/* No `[&_[data-slot=card]]` normalizing rules here: every settings
            page now builds on `Panel`/`PanelSection` rather than `<Card>`, so
            there is nothing left to patch. */}
        <div className="min-w-0">{children}</div>
      </div>
    </PageShell>
  )
}
