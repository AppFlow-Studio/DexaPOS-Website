"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSession } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnreadTicketCounts } from "@/app/dashboard/actions/support";

interface NotificationBellProps {
  /**
   * Server action returning role-aware unread counts (get_unread_ticket_counts).
   * Each surface passes its own action; both hit the same JWT-scoped RPC.
   */
  fetchCounts: () => Promise<UnreadTicketCounts>;
  /** Where the bell links to (support inbox for that surface). */
  href: string;
  /** React Query key — keep distinct per surface so caches don't collide. */
  queryKey: string;
}

/**
 * Support-ticket notification bell. The badge count is RPC-backed (survives a
 * hard refresh) and kept live by a realtime subscription on the support tables:
 * any insert/update invalidates the count so it re-fetches within seconds.
 *
 * We build a single authenticated Supabase client for the component lifetime so
 * postgres_changes pass RLS (the merchant sees their own tickets, HQ sees all).
 */
export function NotificationBell({ fetchCounts, href, queryKey }: NotificationBellProps) {
  const queryClient = useQueryClient();
  const { session } = useSession();

  // Keep the latest session in a ref so the memoized client always mints a
  // fresh token without being torn down and resubscribed on every render.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { accessToken: async () => (await sessionRef.current?.getToken()) ?? null }
      ),
    []
  );

  const { data } = useQuery<UnreadTicketCounts>({
    queryKey: [queryKey],
    queryFn: fetchCounts,
    // Realtime is the primary signal; this is a slow safety-net poll.
    refetchInterval: 120_000,
    staleTime: 30_000,
  });

  const total = data?.total ?? 0;

  useEffect(() => {
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: [queryKey] });

    const channel = supabase
      .channel(`support-unread-${queryKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_ticket_messages" },
        invalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, queryClient, queryKey]);

  const badge = total > 99 ? "99+" : String(total);

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href={href} aria-label={total > 0 ? `${total} unread support messages` : "Support"}>
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
      </Link>
    </Button>
  );
}
