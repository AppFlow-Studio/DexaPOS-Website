'use server'

import { createClerkClient } from '@clerk/backend'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { assertHQPermission, assertSuperAdmin } from '@/lib/admin/auth'
import { logAdminAction } from '@/lib/admin/log-admin-action'
import { getPlatformAuditLogs, type PlatformAuditLogRow } from './hq-platform/analytics'

/** One Clerk session, flattened for the user profile's Sessions tab. */
export interface AdminUserSession {
    id: string
    /** Clerk status: `active`, `ended`, `expired`, `revoked`, `removed`, `abandoned`, … */
    status: string
    lastActiveAt: string
    createdAt: string
    expireAt: string
    browser: string | null
    device: string | null
    isMobile: boolean
    location: string | null
    ipAddress: string | null
    /** The session the viewer is using right now. It cannot be revoked from here. */
    isViewerSession: boolean
}

function errorMessage(error: unknown): string {
    const typed = error as { errors?: Array<{ longMessage?: string }>; message?: string }
    return typed?.errors?.[0]?.longMessage || typed?.message || 'Unknown error'
}

export async function getAdminUserSessions(
    userId: string
): Promise<{ data: AdminUserSession[]; error?: string }> {
    try {
        await assertHQPermission('hq.team.manage')
        const { sessionId: viewerSessionId } = await auth()
        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const { data: sessions } = await clerkClient.sessions.getSessionList({ userId, limit: 100 })

        const data = sessions
            .map((session) => {
                const activity = session.latestActivity
                const browser = [activity?.browserName, activity?.browserVersion].filter(Boolean).join(' ')
                const location = [activity?.city, activity?.country].filter(Boolean).join(', ')
                return {
                    id: session.id,
                    status: session.status,
                    lastActiveAt: new Date(session.lastActiveAt).toISOString(),
                    createdAt: new Date(session.createdAt).toISOString(),
                    expireAt: new Date(session.expireAt).toISOString(),
                    browser: browser || null,
                    device: activity?.deviceType || null,
                    isMobile: !!activity?.isMobile,
                    location: location || null,
                    ipAddress: activity?.ipAddress || null,
                    isViewerSession: session.id === viewerSessionId,
                }
            })
            // Active sessions first, then most recently used.
            .sort((a, b) => {
                const activeOrder = Number(b.status === 'active') - Number(a.status === 'active')
                return activeOrder || b.lastActiveAt.localeCompare(a.lastActiveAt)
            })

        return { data }
    } catch (error) {
        console.error('[getAdminUserSessions] Error:', error)
        return { data: [], error: errorMessage(error) }
    }
}

export async function revokeAdminUserSession(params: {
    userId: string
    sessionId: string
}): Promise<{ success: boolean; message: string }> {
    try {
        const authContext = await assertSuperAdmin()
        const { sessionId: viewerSessionId } = await auth()
        if (params.sessionId === viewerSessionId) {
            return { success: false, message: 'That is your current session. Sign out instead.' }
        }

        const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })
        const session = await clerkClient.sessions.getSession(params.sessionId)
        // The id comes from the client: make sure it belongs to the user on screen.
        if (session.userId !== params.userId) {
            return { success: false, message: 'That session does not belong to this user.' }
        }
        if (session.status !== 'active') {
            return { success: false, message: `That session is already ${session.status}.` }
        }

        await clerkClient.sessions.revokeSession(params.sessionId)

        await logAdminAction('ADMIN_SESSION_REVOKED', {
            resourceType: 'user',
            resourceId: params.userId,
            changes: { before: { status: 'active' }, after: { status: 'revoked' } },
            metadata: {
                target_user_id: params.userId,
                session_id: params.sessionId,
                revoked_by: authContext.userId,
            },
        })

        revalidatePath(`/manage/users/${params.userId}`)
        return { success: true, message: 'Session revoked. They are signed out on that device.' }
    } catch (error) {
        console.error('[revokeAdminUserSession] Error:', error)
        return { success: false, message: `Failed to revoke session: ${errorMessage(error)}` }
    }
}

/**
 * Audit-log rows the user did or that were done to them, newest first,
 * server-paged. Needs `system.audit.view` (enforced by `getPlatformAuditLogs`);
 * without it the tab says so instead of failing.
 */
export async function getAdminUserEvents(
    userId: string,
    page: number,
    pageSize = 10
): Promise<{ data: PlatformAuditLogRow[]; total: number; error?: 'forbidden' | string }> {
    try {
        const safePage = Math.max(1, Math.floor(page))
        return await getPlatformAuditLogs({ involvesUserId: userId }, pageSize, (safePage - 1) * pageSize)
    } catch (error) {
        const message = errorMessage(error)
        if (message.startsWith('Unauthorized')) return { data: [], total: 0, error: 'forbidden' }
        console.error('[getAdminUserEvents] Error:', error)
        return { data: [], total: 0, error: message }
    }
}
