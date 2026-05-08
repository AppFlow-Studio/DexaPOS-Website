/**
 * Formats a scheduled order time in the location's timezone.
 * Returns e.g. "Thu, May 8 · 6:30 PM EDT"
 * Always shows the TZ abbreviation so a customer in a different timezone
 * knows which timezone the time refers to.
 */
export function formatScheduledTime(
  isoString: string,
  locationTimezone: string
): string {
  const date = new Date(isoString);

  const dayPart = date.toLocaleDateString("en-US", {
    timeZone: locationTimezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: locationTimezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Extract timezone abbreviation (e.g. "EDT", "PDT", "PST")
  const tzAbbr = date
    .toLocaleTimeString("en-US", {
      timeZone: locationTimezone,
      timeZoneName: "short",
    })
    .split(" ")
    .pop() ?? locationTimezone;

  return `${dayPart} · ${timePart} ${tzAbbr}`;
}
