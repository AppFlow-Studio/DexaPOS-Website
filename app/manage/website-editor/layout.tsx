import { requireAdminAuth } from '@/lib/admin/auth'

/**
 * The marketing-site CMS. Gated on the same permission as its sidebar entry;
 * each page still calls `requireHqUser` for its service-role data client.
 */
export default async function WebsiteEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminAuth('system.config.manage', {
    redirectToDashboard: true,
    requiredLabel: 'system.config.manage',
  })

  return children
}
