"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Clock3, Search, Store, Users, X } from "lucide-react";
import { toast } from "sonner";

import {
  LocationIndicator,
  PageHeader,
  PageShell,
  Panel,
  PanelSection,
} from "@/components/dashboard/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { LogTimesheetExport } from "@/app/dashboard/actions/timesheets";
import { useTimesheetSummary } from "@/hooks/useTimesheets";
import { zonedToday } from "@/lib/reservations/local-time";
import { csvFileName, detailCsvRows, summaryCsvRows, toCsv } from "@/lib/timesheets/csv";
import { downloadCsv } from "@/lib/timesheets/download";
import { formatLongDate, zoneAbbreviation } from "@/lib/timesheets/format";
import {
  bucketsForPeriod,
  formatPeriodLabel,
  inferPeriod,
  parsePeriod,
  periodContaining,
  periodNoun,
  type TimesheetPeriod,
} from "@/lib/timesheets/period";
import {
  buildRows,
  computeTiles,
  filterRows,
  reviewCounts,
  shiftsForCell,
  sortRows,
  sumRows,
  type SummaryRow,
  type SummarySort,
} from "@/lib/timesheets/summary";
import type {
  TimesheetReviewFilter,
  TimesheetShift,
  TimesheetView,
} from "@/lib/timesheets/types";
import { useGatedLocation, useGatedLocationId } from "@/stores/location-store";
import type { ShiftBreakLog, StaffShift } from "@/types/staff";

import { DayDetailDialog } from "./components/DayDetailDialog";
import { ExportMenu } from "./components/ExportMenu";
import { PeriodControls } from "./components/PeriodControls";
import { ReviewChips } from "./components/ReviewChips";
import { ShiftsTable } from "./components/ShiftsTable";
import { SummaryGrid } from "./components/SummaryGrid";
import { TimesheetStats } from "./components/TimesheetStats";
import { ShiftAdjustmentDialog } from "./ShiftAdjustmentDialog";

const REVIEWS: TimesheetReviewFilter[] = ["missing", "long", "norate"];

type DetailState =
  | { kind: "cell"; staffProfileId: string; bucketIndex: number }
  | { kind: "shift"; shiftId: string }
  | null;

function matchesReview(shift: TimesheetShift, review: TimesheetReviewFilter | null) {
  if (review === "missing") return shift.isMissingOut;
  if (review === "long") return shift.isOverMax;
  if (review === "norate") return shift.payCents === null;
  return true;
}

/** The Adjust shift dialog predates this page and speaks `StaffShift`. */
function toStaffShift(
  shift: TimesheetShift,
  locationId: string,
  firstName: string,
  lastName: string,
  avatarUrl: string | null,
): StaffShift {
  return {
    id: shift.id,
    merchant_id: "",
    location_id: locationId,
    staff_profile_id: shift.staffProfileId,
    status: shift.status,
    clock_in_time: shift.clockIn,
    clock_out_time: shift.clockOut,
    break_logs: shift.breakLogs as ShiftBreakLog[],
    hourly_rate_snapshot: shift.rate,
    notes: shift.notes,
    is_verified: shift.isVerified,
    created_at: "",
    updated_at: "",
    staff_profile: { first_name: firstName, last_name: lastName, avatar_url: avatarUrl },
  };
}

export default function TimesheetsPage() {
  // Resolve to the gated location so single-location accounts (locked to 'all')
  // skip the "Select a location" prompt. Multi-location on 'all' -> null.
  const gatedLocationId = useGatedLocationId();
  const selectedLocation = useGatedLocation();
  // Impersonation-aware org id (NOT useAuth().orgId, which stays HQ during impersonation).
  const clerkOrgId = useClerkOrgId();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---- URL state: shareable, back-button safe, survives a refresh ----------
  const timeZone = selectedLocation?.timezone || "America/New_York";
  const today = zonedToday(timeZone);
  const period = parsePeriod(
    {
      period: searchParams.get("period"),
      start: searchParams.get("start"),
      end: searchParams.get("end"),
    },
    today,
  );
  const view: TimesheetView = searchParams.get("view") === "shifts" ? "shifts" : "summary";
  const reviewParam = searchParams.get("review");
  const review = REVIEWS.includes(reviewParam as TimesheetReviewFilter)
    ? (reviewParam as TimesheetReviewFilter)
    : null;
  const member = searchParams.get("member");

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setPeriod = (next: TimesheetPeriod) =>
    updateParams({ period: next.kind, start: next.start, end: next.end });

  // Search is typed fast; the URL follows a moment later.
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((searchParams.get("q") ?? "") !== search) updateParams({ q: search || null });
    }, 300);
    return () => clearTimeout(handle);
  }, [search, searchParams, updateParams]);

  const [sort, setSort] = useState<SummarySort>({ key: "name", direction: "asc" });
  const [detail, setDetail] = useState<DetailState>(null);
  const [shiftToAdjust, setShiftToAdjust] = useState<StaffShift | null>(null);

  // ---- data -----------------------------------------------------------------
  const query = useTimesheetSummary({
    clerkOrgId,
    locationId: gatedLocationId,
    start: period.start,
    end: period.end,
  });
  const data = query.data;
  const isStale = query.isPlaceholderData;
  const zone = data?.meta.timezone ?? timeZone;

  // While the next period loads, the previous one stays on screen in its OWN
  // columns — otherwise its shifts would fall outside the new buckets.
  const shownPeriod = useMemo(
    () => (data && isStale ? inferPeriod(data.meta.rangeStart, data.meta.rangeEnd) : period),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, isStale, period.kind, period.start, period.end],
  );
  const buckets = useMemo(() => bucketsForPeriod(shownPeriod), [shownPeriod]);
  const rows = useMemo(() => (data ? buildRows(data, buckets) : []), [data, buckets]);
  const tiles = useMemo(() => (data ? computeTiles(rows) : null), [data, rows]);
  const counts = useMemo(() => (data ? reviewCounts(rows) : null), [data, rows]);
  const visibleRows = useMemo(
    () => sortRows(filterRows(rows, { search, review }), sort),
    [rows, search, review, sort],
  );
  const footer = useMemo(() => sumRows(visibleRows, buckets.length), [visibleRows, buckets.length]);

  const people = useMemo(
    () => new Map((data?.employees ?? []).map((e) => [e.staffProfileId, e])),
    [data],
  );
  const visibleShifts = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.shifts
      .filter((s) => !member || s.staffProfileId === member)
      .filter((s) => matchesReview(s, review))
      .filter((s) => {
        if (!needle) return true;
        const person = people.get(s.staffProfileId);
        return (
          (person?.displayName ?? "").toLowerCase().includes(needle) ||
          (person?.roleName ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  }, [data, member, review, search, people]);

  // ---- per-location gate ------------------------------------------------------
  if (!gatedLocationId || !selectedLocation) {
    return (
      <PageShell>
        <PageHeader
          title="Timesheets"
          subtitle="Hours worked by each team member, by week or month."
          backHref="/dashboard/staff"
          backLabel="Back to Staff"
        />
        <Panel padded>
          <div className="flex min-h-72 flex-col items-center justify-center space-y-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
              <Store className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
                Select a location
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a specific location from the dashboard header to see its timesheets.
              </p>
            </div>
          </div>
        </Panel>
      </PageShell>
    );
  }

  // ---- handlers -------------------------------------------------------------
  const openPerson = (staffProfileId: string) => {
    setDetail(null);
    updateParams({ view: "shifts", member: staffProfileId });
  };

  const onCellOpen = (row: SummaryRow, bucketIndex: number) => {
    const bucket = buckets[bucketIndex];
    if (bucket.kind === "week") {
      // A week cell opens that week, day by day.
      setPeriod(periodContaining("week", bucket.start));
      return;
    }
    setDetail({ kind: "cell", staffProfileId: row.employee.staffProfileId, bucketIndex });
  };

  const onAdjust = (shift: TimesheetShift) => {
    const person = people.get(shift.staffProfileId);
    setShiftToAdjust(
      toStaffShift(shift, gatedLocationId, person?.firstName ?? "", person?.lastName ?? "", person?.avatarUrl ?? null),
    );
  };

  const onExport = (kind: "summary" | "shifts") => {
    if (!data) return;
    const csvRows =
      kind === "summary" ? summaryCsvRows(visibleRows, footer, buckets) : detailCsvRows(data);
    downloadCsv(
      csvFileName(kind, data.meta.locationName, data.meta.rangeStart, data.meta.rangeEnd),
      toCsv(csvRows),
    );
    toast.success(kind === "summary" ? "Summary exported" : "Shift detail exported");
    void LogTimesheetExport({
      clerkOrgId,
      locationId: gatedLocationId,
      kind,
      start: data.meta.rangeStart,
      end: data.meta.rangeEnd,
      rowCount: csvRows.length - 1,
    });
  };

  const clearFilters = () => {
    setSearch("");
    updateParams({ review: null, member: null, q: null });
  };
  const hasFilters = Boolean(search || review || (view === "shifts" && member));

  // ---- dialog content -------------------------------------------------------
  let detailProps: {
    employeeId: string;
    heading: string;
    shifts: TimesheetShift[];
  } | null = null;
  if (data && detail?.kind === "cell") {
    const row = rows.find((r) => r.employee.staffProfileId === detail.staffProfileId);
    const bucket = buckets[detail.bucketIndex];
    if (row && bucket) {
      detailProps = {
        employeeId: row.employee.staffProfileId,
        heading: formatLongDate(bucket.start),
        shifts: shiftsForCell(data, row, detail.bucketIndex),
      };
    }
  } else if (data && detail?.kind === "shift") {
    const shift = data.shifts.find((s) => s.id === detail.shiftId);
    if (shift) {
      detailProps = {
        employeeId: shift.staffProfileId,
        heading: formatLongDate(shift.localDate),
        shifts: [shift],
      };
    }
  }
  const detailPerson = detailProps ? people.get(detailProps.employeeId) ?? null : null;

  // ---- empty states ---------------------------------------------------------
  const noTeam = data && data.employees.length === 0;
  const emptyState = noTeam ? (
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted/60">
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-[0.9375rem] font-medium text-foreground">
          No one works at {selectedLocation.name} yet
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add team members from Staff and their hours will show here once they clock in.
        </p>
      </div>
      <Button variant="outline" className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm" asChild>
        <Link href="/dashboard/staff">Go to Staff</Link>
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
      <p className="text-sm">
        {view === "shifts" && !hasFilters
          ? `No shifts ${periodNoun(shownPeriod)}`
          : "Nothing matches these filters"}
      </p>
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 rounded-full px-3" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          Clear filters
        </Button>
      )}
    </div>
  );

  const memberOptions = data?.employees ?? [];
  const countLine =
    view === "summary"
      ? `Showing ${visibleRows.length} of ${rows.length} team member${rows.length === 1 ? "" : "s"}`
      : `Showing ${visibleShifts.length} shift${visibleShifts.length === 1 ? "" : "s"}${
          member && people.get(member) ? ` · ${people.get(member)!.displayName}` : ""
        } · ${formatPeriodLabel(shownPeriod)}`;

  return (
    <PageShell>
      <PageHeader
        title="Timesheets"
        subtitle="Hours worked by each team member, by week or month."
        backHref="/dashboard/staff"
        backLabel="Back to Staff"
        indicator={<LocationIndicator isAllLocations={false} locationName={selectedLocation.name} />}
        actions={<ExportMenu disabled={!data || isStale} onExport={onExport} />}
      />

      <PeriodControls period={period} today={today} onChange={setPeriod} />

      <TimesheetStats tiles={tiles} isLoading={query.isLoading} />

      <Panel>
        <PanelSection
          icon={view === "summary" ? Users : Clock3}
          label={view === "summary" ? "Hours by team member" : "Shifts"}
          caption={
            view === "summary"
              ? shownPeriod.kind === "month" || buckets[0]?.kind === "week"
                ? "Select a week to open it day by day. Select a name to see that person’s shifts."
                : "Select a day to see the shifts behind it. Select a name to see all of that person’s shifts."
              : "Every clock-in and clock-out in this period. Managers can correct a shift from its menu."
          }
          action={
            <Tabs
              value={view}
              onValueChange={(value) =>
                updateParams({ view: value === "shifts" ? "shifts" : null, member: value === "shifts" ? member : null })
              }
            >
              <TabsList className="inline-flex h-auto w-max gap-0.5 rounded-full bg-muted/70 p-1">
                {(["summary", "shifts"] as const).map((value) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
                  >
                    {value === "summary" ? "Summary" : "Shifts"}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        >
          {query.isError && !data ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 text-center">
              <CircleAlert className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {query.error instanceof Error ? query.error.message : "Timesheets couldn't be loaded."}
              </p>
              <Button
                variant="outline"
                className="h-9 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
                onClick={() => query.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div className="min-w-0 space-y-5">
              {/* Wraps rather than squeezing: with a member select and three
                  review chips the row outgrows a laptop panel, and a squeezed
                  chip rail clipped its last chip mid-word. */}
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 basis-80 flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                    <Input
                      placeholder="Search team members…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 w-full rounded-full pl-10"
                      aria-label="Search team members"
                    />
                  </div>
                  {view === "shifts" && (
                    <Select
                      value={member ?? "all"}
                      onValueChange={(value) => updateParams({ member: value === "all" ? null : value })}
                    >
                      <SelectTrigger
                        className="h-9 w-full min-w-0 rounded-full border-0 bg-muted/60 px-3 shadow-none [&>span]:truncate sm:w-50"
                        aria-label="Team member"
                      >
                        <SelectValue placeholder="All team members" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All team members</SelectItem>
                        {memberOptions.map((e) => (
                          <SelectItem key={e.staffProfileId} value={e.staffProfileId}>
                            {e.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex min-w-0 max-w-full items-center gap-2">
                  <ReviewChips
                    counts={counts}
                    active={review}
                    onChange={(next) => updateParams({ review: next })}
                    periodNoun={periodNoun(shownPeriod)}
                  />
                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 shrink-0 rounded-full px-3 text-muted-foreground"
                      onClick={clearFilters}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>

              {view === "summary" ? (
                <SummaryGrid
                  rows={visibleRows}
                  totals={footer}
                  buckets={buckets}
                  today={today}
                  isLoading={query.isLoading}
                  isStale={isStale}
                  review={review}
                  sort={sort}
                  onSortChange={setSort}
                  onCellOpen={onCellOpen}
                  onPersonOpen={(row) => openPerson(row.employee.staffProfileId)}
                  empty={emptyState}
                />
              ) : (
                <ShiftsTable
                  shifts={visibleShifts}
                  people={people}
                  timeZone={zone}
                  isLoading={query.isLoading}
                  isStale={isStale}
                  onAdjust={onAdjust}
                  onView={(shift) => setDetail({ kind: "shift", shiftId: shift.id })}
                  empty={emptyState}
                />
              )}

              <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:text-sm">
                <span>{countLine}</span>
                <span>
                  Hours count on the day a shift starts · {zoneAbbreviation(zone)} · Weeks run Mon–Sun
                </span>
              </div>
            </div>
          )}
        </PanelSection>
      </Panel>

      <DayDetailDialog
        open={Boolean(detailProps)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        employee={detailPerson}
        heading={detailProps?.heading ?? ""}
        shifts={detailProps?.shifts ?? []}
        timeZone={zone}
        continueLabel={
          detailPerson
            ? `All of ${detailPerson.firstName.trim() || detailPerson.displayName}’s shifts ${periodNoun(shownPeriod)}`
            : "Open in shift list"
        }
        onContinue={() => detailProps && openPerson(detailProps.employeeId)}
      />

      <ShiftAdjustmentDialog
        clerkOrgId={clerkOrgId}
        shift={shiftToAdjust}
        timeZone={zone}
        open={Boolean(shiftToAdjust)}
        onOpenChange={(open) => {
          if (!open) setShiftToAdjust(null);
        }}
      />
    </PageShell>
  );
}
