"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  Flame,
  Ban,
  Timer,
  ChefHat,
  ArrowRight,
} from "lucide-react";
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

// ─── Helpers ───

function formatShortTime(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

  const statuses = activeItems.map((i) => i.kitchen_status);

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
        const timeStr = ts ? formatShortTime(ts) : null;

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
  const hasKitchenStatus = !!item.kitchen_status;
  const timestamps = getStageTimestamps(item);

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
        "flex items-center gap-3 py-2 first:pt-0 last:pb-0",
        isVoided && "opacity-50"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-sm truncate",
              isVoided && "line-through text-muted-foreground"
            )}
          >
            {item.item_name}
          </span>
          {isVoided && (
            <Badge
              variant="destructive"
              className="text-[9px] px-1 py-0 h-3.5 shrink-0"
            >
              VOIDED
            </Badge>
          )}
        </div>

        {isVoided ? (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {item.kitchen_status
              ? `Voided at ${item.kitchen_status} stage`
              : "Never sent to kitchen"}
          </p>
        ) : hasKitchenStatus ? (
          <div className="mt-1">
            <KitchenStatusPipeline status={item.kitchen_status} timestamps={timestamps} />
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Fulfilled immediately
          </p>
        )}
      </div>

      {!isVoided && prepDuration && item.kitchen_status === "completed" && (
        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
          {prepDuration}
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

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Course header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">
              {course.label}
            </span>
          </div>
          {/* Timing row */}
          {(fireTimeStr || lastCompletedStr) && (
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
              {fireTimeStr && (
                <span className="flex items-center gap-0.5">
                  <Flame className="h-2.5 w-2.5" />
                  Fired: {fireTimeStr}
                </span>
              )}
              {fireTimeStr && lastCompletedStr && (
                <span className="text-muted-foreground/30">·</span>
              )}
              {lastCompletedStr && (
                <span className="flex items-center gap-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Completed: {lastCompletedStr}
                </span>
              )}
              {course.durationMinutes != null && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex items-center gap-0.5">
                    <Timer className="h-2.5 w-2.5" />
                    {formatDuration(course.durationMinutes)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 h-4 shrink-0 font-medium border-0",
            course.overallStatus.bgColor,
            course.overallStatus.color
          )}
        >
          {course.overallStatus.label}
        </Badge>
      </div>

      {/* Items */}
      <div className="px-3 py-2 divide-y">
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
      (i) => !i.is_voided && i.completed_at && i.created_at
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

    const total = durations.reduce((sum, d) => sum + d.minutes, 0);
    const avg = Math.round((total / durations.length) * 10) / 10;
    const longest = durations.reduce((max, d) =>
      d.minutes > max.minutes ? d : max
    );

    return { avg, longest, count: durations.length };
  }, [items]);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-4 rounded-lg bg-muted/40 border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Timer className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium">Kitchen Performance</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span>
          Avg prep: <span className="font-medium text-foreground">{formatDuration(Math.round(stats.avg))}</span>
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span>
          Longest: <span className="font-medium text-foreground">{stats.longest.name}</span>{" "}
          <span className="text-muted-foreground">({formatDuration(stats.longest.minutes)})</span>
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───

interface KitchenSectionProps {
  items: RichItem[];
}

export function hasKitchenData(items: RichItem[]): boolean {
  return items.some((i) => i.kitchen_status != null || i.course_number != null);
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
        completedTimes.length > 0 && completedTimes.length === activeItems.filter((i) => i.kitchen_status === "completed").length
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
