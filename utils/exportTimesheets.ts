import { StaffShift } from "@/types/staff";
import { format, differenceInMinutes } from "date-fns";

function getBreakDurationMinutes(
  breakLog: NonNullable<StaffShift["break_logs"]>[number]
) {
  if (typeof breakLog.duration_minutes === "number") {
    return breakLog.duration_minutes;
  }

  if (!breakLog.start_at || !breakLog.end_at) {
    return 0;
  }

  const minutes = differenceInMinutes(
    new Date(breakLog.end_at),
    new Date(breakLog.start_at)
  );

  return minutes > 0 ? minutes : 0;
}

export const calculateShiftDuration = (shift: StaffShift): number => {
  if (!shift.clock_out_time) return 0;

  const start = new Date(shift.clock_in_time);
  const end = new Date(shift.clock_out_time);
  const totalDiff = differenceInMinutes(end, start);

  // Sum unpaid break durations to subtract from total time
  const breaks = shift.break_logs || [];
  const unpaidBreakMinutes = breaks
    .filter((b) => b.type === "unpaid")
    .reduce((acc, b) => acc + getBreakDurationMinutes(b), 0);

  const netMinutes = totalDiff - unpaidBreakMinutes;
  return netMinutes > 0 ? netMinutes / 60 : 0;
};

export const downloadTimesheetCSV = (shifts: StaffShift[]) => {
  const headers = [
    "Employee",
    "Location",
    "Date",
    "Clock In",
    "Clock Out",
    "Breaks (min)",
    "Total Hours",
    "Est. Pay",
    "Status",
  ];

  const rows = shifts.map((s) => {
    const hours = calculateShiftDuration(s);
    const pay = s.hourly_rate_snapshot
      ? (hours * s.hourly_rate_snapshot).toFixed(2)
      : "0.00";

    return [
      s.staff_profile
        ? `${s.staff_profile.first_name} ${s.staff_profile.last_name}`
        : "Unknown",
      s.location?.name || "N/A",
      format(new Date(s.clock_in_time), "yyyy-MM-dd"),
      format(new Date(s.clock_in_time), "HH:mm"),
      s.clock_out_time ? format(new Date(s.clock_out_time), "HH:mm") : "Active",
      (s.break_logs || []).reduce((acc, b) => acc + getBreakDurationMinutes(b), 0),
      hours.toFixed(2),
      `$${pay}`,
      s.status,
    ];
  });

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `timesheets_export_${format(new Date(), "yyyy-MM-dd")}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
