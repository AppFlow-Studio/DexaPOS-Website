"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Timer, ArrowRight } from "lucide-react";
import type { OrderFullHistory } from "@/types/order-full-history";

type RichItem = NonNullable<OrderFullHistory["items"]>[number];

// ─── Kitchen status pipeline ───

const KITCHEN_STAGES = ["new", "preparing", "ready", "completed"] as const;
type KitchenStage = (typeof KITCHEN_STAGES)[number];

const STAGE_CONFIG: Record<
  KitchenStage,
  { label: string; color: string; activeColor: string; dotActive: string; dotInactive: string }
> = {
  new: {
    label: "New",
    color: "text-muted-foreground",
    activeColor: "text-gray-700 dark:text-gray-300",
    dotActive: "bg-gray-500",
    dotInactive: "bg-gray-300 dark:bg-gray-700",
  },
  preparing: {
    label: "Preparing",
    color: "text-blue-600 dark:text-blue-400",
    activeColor: "text-blue-700 dark:text-blue-300",
    dotActive: "bg-blue-500",
    dotInactive: "bg-gray-300 dark:bg-gray-700",
  },
  ready: {
    label: "Ready",
    color: "text-amber-600 dark:text-amber-400",
    activeColor: "text-amber-700 dark:text-amber-300",
    dotActive: "bg-amber-500",
    dotInactive: "bg-gray-300 dark:bg-gray-700",
  },
  completed: {
    label: "Completed",
    color: "text-emerald-600 dark:text-emerald-400",
    activeColor: "text-emerald-700 dark:text-emerald-300",
    dotActive: "bg-emerald-500",
    dotInactive: "bg-gray-300 dark:bg-gray-700",
  },
};

function stageIndex(status: string | null): number {
  if (!status) return -1;
  const idx = KITCHEN_STAGES.indexOf(status as KitchenStage);
  return idx;
}

/**
 * Per-item kitchen_status falls back to inference from the timestamp columns.
 * Why: the POS keeps the timestamp columns (sent_to_kitchen_at,
 * started_preparing_at, completed_at) up to date but doesn't always write
 * order_items.kitchen_status. Without this fallback the pipeline silently
 * hides itself for items that clearly went through the kitchen.
 */
function deriveKitchenStatus(item: RichItem): KitchenStage | null {
  if (item.kitchen_status && (KITCHEN_STAGES as readonly string[]).includes(item.kitchen_status)) {
    return item.kitchen_status as KitchenStage;
  }
  const anyItem = item as any;
  if (item.completed_at) return "completed";
  if (anyItem.started_preparing_at || anyItem.preparing_at) return "preparing";
  if (anyItem.sent_to_kitchen_at || item.fire_time) return "new";
  return null;
}

// ─── Helpers ───

function formatShortTime(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Normalize to ms for equality; same moment => same time shown once. */
function timeMs(ts: string | null | undefined): number | null {
  if (ts == null) return null;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : null;
}

function diffMinutes(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e)) return null;
  return Math.round((e - s) / 60000);
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "<1 min";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

function getCourseOverallStatus(items: RichItem[]): {
  label: string;
  color: string;
  bgColor: string;
} {
  const activeItems = items.filter((i) => !i.is_voided);
  if (activeItems.length === 0) {
    return {
      label: "Voided",
      color: "text-red-700 dark:text-red-400",
      bgColor: "bg-red-50 dark:bg-red-900/20",
    };
  }

  const statuses = activeItems.map((i) => deriveKitchenStatus(i));

  if (statuses.every((s) => s === "completed")) {
    return {
      label: "Completed",
      color: "text-emerald-700 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    };
  }
  if (statuses.every((s) => s === "ready" || s === "completed")) {
    return {
      label: "Ready",
      color: "text-amber-700 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    };
  }
  if (statuses.some((s) => s === "preparing")) {
    return {
      label: "Preparing",
      color: "text-blue-700 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    };
  }
  if (statuses.some((s) => s === "new")) {
    return {
      label: "New",
      color: "text-gray-700 dark:text-gray-400",
      bgColor: "bg-gray-50 dark:bg-gray-800/30",
    };
  }
  return {
    label: "Pending",
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
  };
}

// ─── Sub-components ───

type StageTimestamps = Record<KitchenStage, string | null>;

function getStageTimestamps(item: RichItem): StageTimestamps {
  return {
    new: item.fire_time ?? item.created_at,
    preparing: item.preparing_at ?? null,
    ready: item.ready_at ?? null,
    completed: item.completed_at ?? null,
  };
}

function KitchenStatusPipeline({
  status,
  timestamps,
}: {
  status: string | null;
  timestamps?: StageTimestamps;
}) {
  const currentIdx = stageIndex(status);

  return (
    <div className="flex items-center gap-0.5">
      {KITCHEN_STAGES.map((stage, idx) => {
        const reached = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        const cfg = STAGE_CONFIG[stage];
        const isLast = idx === KITCHEN_STAGES.length - 1;
        const ts = timestamps?.[stage];
        const firstMs = timeMs(timestamps?.new ?? null);
        const tsMs = timeMs(ts);
        // Show time only once per distinct moment: never repeat the same time (compare by value, not string)
        const sameAsFirst = tsMs != null && firstMs != null && tsMs === firstMs;
        const showTime = reached && ts && (idx === 0 || !sameAsFirst);
        const timeStr = showTime ? formatShortTime(ts) : null;

        return (
          <React.Fragment key={stage}>
            <div className="flex items-center gap-1">
              <div
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0 transition-colors",
                  reached ? cfg.dotActive : cfg.dotInactive
                )}
              />
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-[10px] leading-none whitespace-nowrap",
                    isCurrent ? `font-semibold ${cfg.activeColor}` : reached ? cfg.color : "text-muted-foreground/40"
                  )}
                >
                  {cfg.label}
                </span>
                {reached && timeStr && (
                  <span className="text-[9px] leading-tight text-muted-foreground/70 tabular-nums mt-0.5">
                    {timeStr}
                  </span>
                )}
              </div>
            </div>
            {!isLast && (
              <ArrowRight
                className={cn(
                  "h-2 w-2 shrink-0 mx-0.5",
                  reached && idx < currentIdx
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground/20"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function KitchenItemRow({ item }: { item: RichItem }) {
  const isVoided = item.is_voided;
  const effectiveStatus = deriveKitchenStatus(item);
  const hasKitchenStatus = !!effectiveStatus;
  const timestamps = getStageTimestamps(item);
  const completedTimeStr = formatShortTime(item.completed_at);

  const prepDuration = (() => {
    const start = item.fire_time ?? item.created_at;
    const end = item.completed_at;
    const mins = diffMinutes(start, end);
    if (mins == null) return null;
    return formatDuration(mins);
  })();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0",
        isVoided && "opacity-60"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isVoided && <span className="text-muted-foreground" aria-hidden>⊘</span>}
          <span
            className={cn(
              "text-sm truncate",
              isVoided && "line-through text-muted-foreground"
            )}
          >
            {item.item_name}
          </span>
          {isVoided && (
            <span className="text-xs text-muted-foreground font-medium">
              VOIDED {!effectiveStatus ? "(never prepared)" : ""}
            </span>
          )}
        </div>

        {!isVoided && hasKitchenStatus && (
          <div className="mt-1.5">
            <KitchenStatusPipeline status={effectiveStatus} timestamps={timestamps} />
          </div>
        )}
      </div>

      {/* Completion time on the right */}
      {!isVoided && effectiveStatus === "completed" && completedTimeStr && (
        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
          {completedTimeStr}
        </span>
      )}
    </div>
  );
}

interface CourseGroup {
  courseNumber: number | null;
  label: string;
  items: RichItem[];
  fireTime: string | null;
  lastCompletedAt: string | null;
  durationMinutes: number | null;
  overallStatus: ReturnType<typeof getCourseOverallStatus>;
}

function CourseCard({ course }: { course: CourseGroup }) {
  const fireTimeStr = formatShortTime(course.fireTime);
  const lastCompletedStr = formatShortTime(course.lastCompletedAt);
  const isCompleted = course.overallStatus.label === "Completed";

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Course header: "Course 1 — Appetizers" with "COMPLETED ✅" */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 border-b">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {course.label}
            </span>
          </div>
          {/* Course-level timing: Fired · Completed · Duration */}
          {(fireTimeStr || lastCompletedStr) && (
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {fireTimeStr && (
                <span>
                  Fired: {fireTimeStr}
                </span>
              )}
              {fireTimeStr && lastCompletedStr && (
                <span className="text-muted-foreground/50">·</span>
              )}
              {lastCompletedStr && (
                <span>
                  Completed: {lastCompletedStr}
                </span>
              )}
              {course.durationMinutes != null && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>
                    Duration: {formatDuration(course.durationMinutes)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <span
          className={cn(
            "text-xs font-semibold shrink-0 flex items-center gap-1",
            course.overallStatus.color
          )}
        >
          {isCompleted ? (
            <>
              COMPLETED <span aria-hidden>✅</span>
            </>
          ) : (
            course.overallStatus.label
          )}
        </span>
      </div>

      {/* Items in box */}
      <div className="px-3 py-2 divide-y divide-border">
        {course.items.map((item) => (
          <KitchenItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── Performance Summary ───

function KitchenPerformanceSummary({ items }: { items: RichItem[] }) {
  const stats = React.useMemo(() => {
    const completedItems = items.filter(
      (i) => !i.is_voided && i.completed_at && (i.fire_time || i.created_at)
    );

    if (completedItems.length === 0) return null;

    const durations = completedItems
      .map((i) => {
        const start = i.fire_time ?? i.created_at;
        const mins = diffMinutes(start, i.completed_at);
        return { name: i.item_name, minutes: mins };
      })
      .filter((d): d is { name: string; minutes: number } => d.minutes != null);

    if (durations.length === 0) return null;

    const totalPrep = durations.reduce((sum, d) => sum + d.minutes, 0);
    const avg = Math.round((totalPrep / durations.length) * 10) / 10;
    const longest = durations.reduce((max, d) =>
      d.minutes > max.minutes ? d : max
    );

    // Total kitchen time: first fire to last completion across all items
    const allStarts = items
      .filter((i) => !i.is_voided && (i.fire_time || i.created_at))
      .map((i) => new Date(i.fire_time ?? i.created_at!).getTime());
    const allEnds = items
      .filter((i) => !i.is_voided && i.completed_at)
      .map((i) => new Date(i.completed_at!).getTime());
    const firstStart = allStarts.length ? Math.min(...allStarts) : null;
    const lastEnd = allEnds.length ? Math.max(...allEnds) : null;
    const totalKitchenMinutes =
      firstStart != null && lastEnd != null
        ? Math.round((lastEnd - firstStart) / 60000)
        : null;

    return {
      avg,
      longest,
      count: durations.length,
      totalKitchenMinutes,
    };
  }, [items]);

  if (!stats) return null;

  return (
    <div className="rounded-lg bg-muted/40 border px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Timer className="h-3.5 w-3.5" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wider">
          Kitchen Performance
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground">
        <span>
          Avg prep time:{" "}
          <span className="font-medium">{formatDuration(stats.avg)}</span>
        </span>
        <span className="text-muted-foreground/50">·</span>
        <span>
          Longest item:{" "}
          <span className="font-medium">{stats.longest.name}</span>{" "}
          <span className="text-muted-foreground">
            ({formatDuration(stats.longest.minutes)})
          </span>
        </span>
        {stats.totalKitchenMinutes != null && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span>
              Total kitchen time:{" "}
              <span className="font-medium">
                {formatDuration(stats.totalKitchenMinutes)}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───

interface KitchenSectionProps {
  items: RichItem[];
}

export function hasKitchenData(items: RichItem[]): boolean {
  return items.some(
    (i) =>
      i.kitchen_status != null ||
      i.course_number != null ||
      deriveKitchenStatus(i) != null
  );
}

export function KitchenSection({ items }: KitchenSectionProps) {
  const courseGroups = React.useMemo(() => {
    const groups = new Map<number | null, RichItem[]>();

    for (const item of items) {
      const key = item.course_number;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const sorted = [...groups.entries()].sort(([a], [b]) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    });

    return sorted.map(([courseNumber, courseItems]): CourseGroup => {
      const categoryName = courseItems.find((i) => i.category_name)?.category_name;
      const label =
        courseNumber != null
          ? `Course ${courseNumber}${categoryName ? ` — ${categoryName}` : ""}`
          : categoryName
            ? `No Course — ${categoryName}`
            : "No Course";

      const activeItems = courseItems.filter((i) => !i.is_voided);

      const fireTimes = courseItems
        .map((i) => i.fire_time)
        .filter(Boolean) as string[];
      const fireTime =
        fireTimes.length > 0
          ? fireTimes.sort()[0]
          : null;

      const completedTimes = activeItems
        .map((i) => i.completed_at)
        .filter(Boolean) as string[];
      const lastCompletedAt =
        completedTimes.length > 0 &&
        completedTimes.length ===
          activeItems.filter((i) => deriveKitchenStatus(i) === "completed").length
          ? completedTimes.sort().at(-1)!
          : null;

      const durationMinutes =
        fireTime && lastCompletedAt
          ? diffMinutes(fireTime, lastCompletedAt)
          : null;

      return {
        courseNumber,
        label,
        items: courseItems,
        fireTime,
        lastCompletedAt,
        durationMinutes,
        overallStatus: getCourseOverallStatus(courseItems),
      };
    });
  }, [items]);

  return (
    <div className="space-y-3">
      {courseGroups.map((course) => (
        <CourseCard
          key={course.courseNumber ?? "none"}
          course={course}
        />
      ))}
      <KitchenPerformanceSummary items={items} />
    </div>
  );
}
