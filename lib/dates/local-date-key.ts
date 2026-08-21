function formatLocalDateParts(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateKey(
  date: Date = new Date(),
  timeZone?: string | null,
): string {
  if (!timeZone) {
    return formatLocalDateParts(date);
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get("year");
    const month = values.get("month");
    const day = values.get("day");

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Invalid or unsupported timezones fall back to the browser's local date.
  }

  return formatLocalDateParts(date);
}
