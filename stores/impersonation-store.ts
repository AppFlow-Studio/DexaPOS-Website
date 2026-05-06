import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// =============================================================================
// Impersonation Store — client-side mirror of the server-validated session.
// =============================================================================
// IMPORTANT: this store is a UX mirror only. The security boundary is the
// httpOnly cookies + server-side touch_impersonation_session RPC. If the
// store says we're impersonating but the cookies/session don't agree, the
// server will reject the action — this store is just so the banner and
// hooks can render the right shape immediately without an extra round-trip.
//
// Storage: sessionStorage (per-tab, cleared on browser close). Impersonation
// must NOT persist across browser restarts.
// =============================================================================

export interface ImpersonationContext {
  sessionId: string;
  merchantId: string;
  clerkOrgId: string;
  merchantName: string;
  expiresAt: string; // ISO timestamp
  startedAt: string; // ISO; fixed at session creation
  reason: string | null;
}

interface ImpersonationState {
  current: ImpersonationContext | null;
  setImpersonation: (ctx: ImpersonationContext | null) => void;
  clearImpersonation: () => void;
}

export const useImpersonationStore = create<ImpersonationState>()(
  persist(
    (set) => ({
      current: null,
      setImpersonation: (ctx) => set({ current: ctx }),
      clearImpersonation: () => set({ current: null }),
    }),
    {
      name: "impersonation-storage",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? sessionStorage : (undefined as unknown as Storage),
      ),
    },
  ),
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const useIsImpersonating = () =>
  useImpersonationStore((s) => s.current !== null);

export const useImpersonatedMerchant = () =>
  useImpersonationStore((s) => s.current);
