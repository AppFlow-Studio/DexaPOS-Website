"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { PlatformChannelStatus } from "@/lib/orderout/helpers";
import { getChannelLabel } from "@/lib/orderout/platform";

// ============================================================================
// ChannelStatusPills — tiny, reusable per-channel status indicator.
// Used in the Synced Menus row and in PushChannelsHistoryCard rows.
// ============================================================================

const KNOWN_PLATFORMS = ["UBEREATS", "DOORDASH", "GRUBHUB"] as const;

interface ChannelStatusPillsProps {
  statuses?: PlatformChannelStatus[];
  expectedChannels?: string[];
  reportedChannels?: string[];
  perChannelResults?: Array<{
    deliveryService: string;
    status: string;
    errorMessage: string | null;
  }>;
}

type PillState = "live" | "pending" | "failed" | "notExpected";

function stateClass(state: PillState): string {
  switch (state) {
    case "live":
      return "bg-green-500";
    case "pending":
      return "bg-yellow-400";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-muted";
  }
}

function stateLabel(state: PillState, error?: string | null): string {
  switch (state) {
    case "live":
      return "Live";
    case "pending":
      return "Pending";
    case "failed":
      return error ? `Failed: ${error}` : "Failed";
    default:
      return "Not expected";
  }
}

export function ChannelStatusPills({
  statuses,
  expectedChannels,
  reportedChannels,
  perChannelResults,
}: ChannelStatusPillsProps) {
  // Build an index from whichever data source is provided.
  // Priority: per-channel results > platform statuses > expected/reported arrays.
  const resultByPlatform = new Map<
    string,
    { state: PillState; error: string | null }
  >();

  if (perChannelResults && perChannelResults.length > 0) {
    for (const r of perChannelResults) {
      const key = r.deliveryService.toUpperCase();
      const state: PillState =
        r.status === "success"
          ? "live"
          : r.status === "failed"
            ? "failed"
            : "pending";
      resultByPlatform.set(key, { state, error: r.errorMessage });
    }
  }

  if (statuses && statuses.length > 0) {
    for (const s of statuses) {
      const key = s.platform.toUpperCase();
      if (resultByPlatform.has(key)) continue;
      const state: PillState =
        s.status === "success"
          ? "live"
          : s.status === "failed"
            ? "failed"
            : "pending";
      resultByPlatform.set(key, { state, error: s.last_error });
    }
  }

  const expectedSet = new Set(
    (expectedChannels ?? []).map((c) => c.toUpperCase())
  );
  const reportedSet = new Set(
    (reportedChannels ?? []).map((c) => c.toUpperCase())
  );

  // Union of known platforms + any extras present in data
  const allPlatforms = new Set<string>([
    ...KNOWN_PLATFORMS,
    ...Array.from(resultByPlatform.keys()),
    ...Array.from(expectedSet),
    ...Array.from(reportedSet),
  ]);

  const pills = Array.from(allPlatforms).map((platform) => {
    let state: PillState = "notExpected";
    let error: string | null = null;

    const fromResult = resultByPlatform.get(platform);
    if (fromResult) {
      state = fromResult.state;
      error = fromResult.error;
    } else if (expectedSet.has(platform)) {
      state = reportedSet.has(platform) ? "live" : "pending";
    }

    return { platform, state, error };
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1.5">
        {pills.map(({ platform, state, error }) => (
          <Tooltip key={platform}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <span
                  aria-hidden
                  className={`inline-block h-2 w-2 rounded-full ${stateClass(state)}`}
                />
                <span className="text-xs text-muted-foreground">
                  {getChannelLabel(platform)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <span className="text-xs">
                {getChannelLabel(platform)}: {stateLabel(state, error)}
              </span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
