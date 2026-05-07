"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@clerk/nextjs";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

type BrowserClient = ReturnType<typeof createBrowserSupabaseClient>;

/**
 * Subscribes to staff_profiles and members table changes for the current merchant.
 * On any INSERT/UPDATE/DELETE, invalidates the unified-staff cache so the list
 * refreshes immediately instead of waiting for the 30s staleTime.
 */
export function useStaffRealtime() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { data: userInfo } = useUserInfo();

  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id ?? "";
  const merchantId = (userInfo?.members?.[0]?.organizations as { merchants?: { id?: string } } | undefined)?.merchants?.id ?? "";

  const clientRef = useRef<BrowserClient | null>(null);
  const channelsRef = useRef<ReturnType<BrowserClient["channel"]>[]>([]);

  useEffect(() => {
    if (!session || !clerkOrgId || !merchantId) return;

    let cancelled = false;

    async function subscribe() {
      const token = await session!.getToken();
      if (!token || cancelled) return;

      // Clean up any existing channels before re-subscribing
      if (clientRef.current && channelsRef.current.length > 0) {
        for (const ch of channelsRef.current) {
          clientRef.current.removeChannel(ch);
        }
        channelsRef.current = [];
      }

      const supabase = createBrowserSupabaseClient(token);
      clientRef.current = supabase;

      function invalidate() {
        queryClient.invalidateQueries({ queryKey: ["unified-staff"] });
      }

      // Subscribe to members table changes for this org
      const membersChannel = supabase
        .channel(`staff-members-${clerkOrgId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "members",
            filter: `organization_id=eq.${clerkOrgId}`,
          },
          invalidate,
        )
        .subscribe();

      // Subscribe to staff_profiles changes for this merchant
      const profilesChannel = supabase
        .channel(`staff-profiles-${merchantId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "staff_profiles",
            filter: `merchant_id=eq.${merchantId}`,
          },
          invalidate,
        )
        .subscribe();

      if (!cancelled) {
        channelsRef.current = [membersChannel, profilesChannel];
      } else {
        supabase.removeChannel(membersChannel);
        supabase.removeChannel(profilesChannel);
      }
    }

    subscribe();

    return () => {
      cancelled = true;
      if (clientRef.current && channelsRef.current.length > 0) {
        for (const ch of channelsRef.current) {
          clientRef.current.removeChannel(ch);
        }
        channelsRef.current = [];
      }
    };
    // Re-subscribe when session, org, or merchant changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, clerkOrgId, merchantId]);
}
