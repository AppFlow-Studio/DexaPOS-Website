import 'server-only'

import { LogAuditEvent } from '@/app/dashboard/actions/audit-logs'
import { currentUser } from '@clerk/nextjs/server'
import {
  ADMIN_ACTIONS,
  type AdminActionKey,
  type AdminAuditSeverity,
} from '@/lib/admin/audit-actions'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export interface AdminActionFieldDiff {
  old: unknown
  new: unknown
}

export type AdminActionDiffMap = Record<string, AdminActionFieldDiff>

export interface AdminActionBeforeAfter {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string
}

type AdminActionChanges = AdminActionDiffMap | AdminActionBeforeAfter

export interface LogAdminActionParams {
  clerkOrgId?: string
  merchantId?: string
  locationId?: string | null
  resourceType?: string
  resourceId?: string
  resourceName?: string
  changes?: AdminActionChanges
  metadata?: Record<string, unknown>
  severity?: AdminAuditSeverity
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isDiffMap(value: AdminActionChanges): value is AdminActionDiffMap {
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return false

  return entries.every(([, candidate]) => {
    if (!candidate || typeof candidate !== 'object') return false
    return 'old' in (candidate as Record<string, unknown>) && 'new' in (candidate as Record<string, unknown>)
  })
}

function normalizeChanges(changes?: AdminActionChanges): AdminActionBeforeAfter | undefined {
  if (!changes) return undefined

  if (isDiffMap(changes)) {
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}

    for (const [field, diff] of Object.entries(changes)) {
      before[field] = diff.old
      after[field] = diff.new
    }

    return { before, after }
  }

  return changes
}

export async function logAdminAction(
  actionKey: AdminActionKey,
  params: LogAdminActionParams = {}
): Promise<void> {
  const definition = ADMIN_ACTIONS[actionKey]
  if (!definition) return

  try {
    const changes = normalizeChanges(params.changes)
    const rawResourceId =
      params.resourceId === undefined || params.resourceId === null
        ? undefined
        : String(params.resourceId)
    const normalizedResourceId =
      rawResourceId && UUID_REGEX.test(rawResourceId) ? rawResourceId : undefined

    const result = await LogAuditEvent({
      clerkOrgId: params.clerkOrgId,
      merchantId: params.merchantId,
      locationId: params.locationId ?? null,
      action: definition.action,
      actionCategory: definition.category,
      severity: params.severity || definition.severity,
      resourceType: params.resourceType,
      resourceId: normalizedResourceId,
      resourceName: params.resourceName,
      changes,
      metadata: {
        admin_action: true,
        admin_action_key: actionKey,
        clerk_org_id: params.clerkOrgId || null,
        resource_id_raw:
          rawResourceId && !normalizedResourceId ? rawResourceId : undefined,
        ...(params.metadata || {}),
      },
    })

    if (!result?.error) {
      return
    }

    console.warn(
      `[logAdminAction:${actionKey}] Primary audit RPC failed, attempting fallback insert:`,
      result.error
    )

    const clerkUser = await currentUser()
    const fallbackSupabase = createServiceRoleClient()

    const fallbackMetadata = {
      admin_action: true,
      admin_action_key: actionKey,
      clerk_org_id: params.clerkOrgId || null,
      resource_id_raw:
        rawResourceId && !normalizedResourceId ? rawResourceId : undefined,
      primary_audit_error: result.error,
      ...(params.metadata || {}),
    }

    const { error: fallbackError } = await fallbackSupabase
      .from('audit_logs')
      .insert({
        actor_user_id: clerkUser?.id || null,
        actor_email: clerkUser?.primaryEmailAddress?.emailAddress || null,
        actor_name: clerkUser?.fullName || clerkUser?.firstName || 'System',
        actor_role: null,
        action: definition.action,
        action_category: definition.category,
        severity: params.severity || definition.severity,
        resource_type: params.resourceType || null,
        resource_id: normalizedResourceId || null,
        resource_name: params.resourceName || null,
        merchant_id: params.merchantId || null,
        location_id: params.locationId || null,
        changes: changes || null,
        metadata: fallbackMetadata,
        status: 'success',
      })

    if (fallbackError) {
      console.error(
        `[logAdminAction:${actionKey}] Fallback audit insert failed:`,
        fallbackError
      )
    }
  } catch (error) {
    console.error(`[logAdminAction:${actionKey}] Failed to write audit log:`, error)
  }
}
