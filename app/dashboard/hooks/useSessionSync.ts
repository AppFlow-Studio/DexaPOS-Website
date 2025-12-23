'use client'

import { useEffect, useRef } from 'react'
import { useSession } from '@clerk/nextjs'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Hook to monitor Clerk session state and prevent unnecessary query invalidation
 * during normal session refresh. Only invalidates queries if session is actually lost.
 */
export function useSessionSync() {
    const { session, isLoaded } = useSession()
    const queryClient = useQueryClient()
    const previousSessionIdRef = useRef<string | null>(null)

    useEffect(() => {
        if (!isLoaded) return

        const currentSessionId = session?.id || null

        // On initial load, just store the session ID
        if (previousSessionIdRef.current === null) {
            previousSessionIdRef.current = currentSessionId
            return
        }

        // If session ID changed (not just refreshed, but actually changed)
        // This typically means the user signed out and back in
        if (previousSessionIdRef.current !== currentSessionId) {
            // Session actually changed - invalidate queries
            queryClient.invalidateQueries()
            previousSessionIdRef.current = currentSessionId
            return
        }

        // If session is lost (was logged in, now not)
        if (previousSessionIdRef.current && !currentSessionId) {
            // Session expired/lost - invalidate queries
            queryClient.invalidateQueries()
            previousSessionIdRef.current = null
            return
        }

        // Normal session refresh (same session ID, token refreshed)
        // Don't invalidate queries - session is still valid
        previousSessionIdRef.current = currentSessionId
    }, [session?.id, isLoaded, queryClient])
}

