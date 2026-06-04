import { addDays, format } from "date-fns";

export const DEFAULT_REPORTING_TIMEZONE = "America/New_York";

export interface AppliedDateRange {
  from: Date;
  to: Date;
}

export interface ReportingQueryRange {
  from: Date;
  to: Date;
}

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

function getCalendarDay(date: Date): CalendarDay {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function addCalendarDays(day: CalendarDay, amount: number): CalendarDay {
  const next = addDays(new Date(Date.UTC(day.year, day.month - 1, day.day)), amount);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function getZonedParts(instant: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return formatter.formatToParts(instant).reduce<Record<string, number>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});
}

function zonedWallClockToUtc(
  day: CalendarDay,
  timeZone: string,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): Date {
  const targetUtcMs = Date.UTC(day.year, day.month - 1, day.day, hour, minute, second, 0);
  let candidate = new Date(targetUtcMs);

  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(candidate, timeZone);
    const zonedUtcMs = Date.UTC(
      parts.year,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
      0
    );
    const diffMs = targetUtcMs - zonedUtcMs;
    if (diffMs === 0) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + diffMs);
  }

  return candidate;
}

export function buildReportingQueryRange(
  appliedRange: AppliedDateRange,
  timezones: Array<string | null | undefined>
): ReportingQueryRange {
  const normalizedTimezones = Array.from(
    new Set(
      timezones
        .map((timezone) => timezone?.trim())
        .filter((timezone): timezone is string => Boolean(timezone))
    )
  );

  const activeTimezones =
    normalizedTimezones.length > 0
      ? normalizedTimezones
      : [DEFAULT_REPORTING_TIMEZONE];

  const startDay = getCalendarDay(appliedRange.from);
  const endExclusiveDay = addCalendarDays(getCalendarDay(appliedRange.to), 1);

  const startInstants = activeTimezones.map((timezone) =>
    zonedWallClockToUtc(startDay, timezone)
  );
  const endInstants = activeTimezones.map((timezone) =>
    zonedWallClockToUtc(endExclusiveDay, timezone)
  );

  return {
    from: new Date(Math.min(...startInstants.map((instant) => instant.getTime()))),
    to: new Date(Math.max(...endInstants.map((instant) => instant.getTime()))),
  };
}

export function fillDailyFinancialStats(
  stats: Array<{
    date: string;
    net_sales: number;
    order_count: number;
    guest_count: number;
  }>,
  appliedRange: AppliedDateRange
) {
  const statsByDate = new Map(stats.map((stat) => [stat.date.slice(0, 10), stat]));
  const start = new Date(
    appliedRange.from.getFullYear(),
    appliedRange.from.getMonth(),
    appliedRange.from.getDate()
  );
  const end = new Date(
    appliedRange.to.getFullYear(),
    appliedRange.to.getMonth(),
    appliedRange.to.getDate()
  );

  const filled = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = format(cursor, "yyyy-MM-dd");
    filled.push(
      statsByDate.get(key) ?? {
        date: key,
        net_sales: 0,
        order_count: 0,
        guest_count: 0,
      }
    );
  }

  return filled;
}

export function fillDailySalesSeries(
  stats: Array<{
    date: string;
    sales: number;
    orders: number;
  }>,
  appliedRange: AppliedDateRange
) {
  const statsByDate = new Map(stats.map((stat) => [stat.date.slice(0, 10), stat]));
  const start = new Date(
    appliedRange.from.getFullYear(),
    appliedRange.from.getMonth(),
    appliedRange.from.getDate()
  );
  const end = new Date(
    appliedRange.to.getFullYear(),
    appliedRange.to.getMonth(),
    appliedRange.to.getDate()
  );

  const filled = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = format(cursor, "yyyy-MM-dd");
    filled.push(
      statsByDate.get(key) ?? {
        date: key,
        sales: 0,
        orders: 0,
      }
    );
  }

  return filled;
}
