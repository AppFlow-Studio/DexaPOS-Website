export const TIMELINE_WINDOWS = [
  { key: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { key: "6h", label: "Last 6 hours", ms: 6 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
] as const;

export type TimelineWindowKey = (typeof TIMELINE_WINDOWS)[number]["key"];
