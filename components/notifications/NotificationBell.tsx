"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
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
 * Support affordance (lifebuoy glyph — deliberately NOT a bell, which reads as
 * notifications). Links to the support inbox; the badge count is RPC-backed
 * (survives a hard refresh), polled every 60s and refreshed when the tab
 * regains focus.
 *
 * No Realtime: Supabase keeps six Postgres Changes connections open while any
 * postgres_changes subscription exists, and this badge was one of the last.
 * A support badge doesn't need sub-minute latency.
 */
export function NotificationBell({ fetchCounts, href, queryKey }: NotificationBellProps) {
  const { data } = useQuery<UnreadTicketCounts>({
    queryKey: [queryKey],
    queryFn: fetchCounts,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const total = data?.total ?? 0;

  const badge = total > 99 ? "99+" : String(total);

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href={href} aria-label={total > 0 ? `${total} unread support messages` : "Support"} title="Support">
        <LifeBuoy className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {badge}
          </span>
        )}
      </Link>
    </Button>
  );
}
