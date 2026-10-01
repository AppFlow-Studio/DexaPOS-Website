/**
 * Whether a single day's schedule is open. Storefront hours arrive in two
 * shapes: online-ordering config writes `{ enabled, from, to }`, while the
 * dashboard location Hours tab writes `{ open, close, is_closed }` (legacy rows
 * may use `closed`). A day with none of these flags is treated as open.
 */
export function isScheduleDayOpen(schedule: {
  enabled?: boolean;
  is_closed?: boolean;
  closed?: boolean;
}): boolean {
  if (typeof schedule.enabled === "boolean") return schedule.enabled;
  return !(schedule.is_closed ?? schedule.closed ?? false);
}
