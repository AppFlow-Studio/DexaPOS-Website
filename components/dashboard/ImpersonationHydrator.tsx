"use client";

import { useEffect } from "react";
import { useImpersonationStore } from "@/stores/impersonation-store";
import { getImpersonationContext } from "@/lib/admin/impersonation";

// =============================================================================
// ImpersonationHydrator — sync client store with server-validated cookie state.
// =============================================================================
// Mounted once inside the dashboard layout. On mount it asks the server for
// the canonical impersonation context (which in turn re-validates the
// session via touch_impersonation_session). The server's view wins — if it
// returns null we clear any stale client state.
//
// Note: this is a client effect, so there's a brief window on full reload
// where the banner is missing before this fires. Acceptable for v1.
// Promotion to RSC hydration is a follow-up.
// =============================================================================

export function ImpersonationHydrator() {
  const setImpersonation = useImpersonationStore((s) => s.setImpersonation);
  const clearImpersonation = useImpersonationStore((s) => s.clearImpersonation);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = await getImpersonationContext();
        if (cancelled) return;
        if (ctx) setImpersonation(ctx);
        else clearImpersonation();
      } catch {
        // Best-effort; leave whatever the store had. The banner is UX only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setImpersonation, clearImpersonation]);

  return null;
}
