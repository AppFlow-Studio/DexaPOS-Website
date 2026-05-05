'use client'

import { useEffect, useRef } from 'react'
import { useSession } from '@clerk/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { resetClientSession } from '@/lib/auth/session-reset'

/**
 * Monitors Clerk session state. On an actual session change or loss,
 * performs a full client-side reset (QueryClient + all Zustand stores + localStorage).
 * Does NOT reset on routine token refreshes (same session ID).
 */
export function useSessionSync() {
    const { session, isLoaded } = useSession()
    const queryClient = useQueryClient()
    const previousSessionIdRef = useRef<string | null>(null)

    useEffect(() => {
        if (!isLoaded) return

        const currentSessionId = session?.id || null

        // On initial load, just record the current session ID
        if (previousSessionIdRef.current === null) {
            previousSessionIdRef.current = currentSessionId
            return
        }

        const sessionChanged = previousSessionIdRef.current !== currentSessionId
        const sessionLost = !!previousSessionIdRef.current && !currentSessionId

        if (sessionChanged || sessionLost) {
            // Full reset — removes stale data from previous user
            resetClientSession(queryClient)
            previousSessionIdRef.current = currentSessionId
        }

        // Normal token refresh (same session ID) — do nothing
    }, [session?.id, isLoaded, queryClient])
}

