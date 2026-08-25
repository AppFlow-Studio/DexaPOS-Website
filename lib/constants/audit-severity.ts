/**
 * Single source of truth for audit-log `severity` presentation.
 *
 * The chip carries a light tint with BLACK text — not the coloured text of the
 * earlier `text-red-700` / `text-amber-700` pairs. The tint alone signals
 * severity; black keeps an 11px label legible on both tints, in both themes.
 *
 * Card borders and icon tints were removed separately: severity reads from
 * this one chip, so a warning row is not also outlined, tinted and iconised.
 */

export type AuditSeverity = "info" | "warning" | "critical" | "error";

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
  error: "Error",
};

/**
 * Neutral tint + coloured text, per severity.
 *
 * One shared grey chip carries the severity in the *text* colour, so the row
 * stays quiet while the word still reads as a warning. The dark-theme text
 * lightens (`-400`) because `amber-700` / `red-700` fail contrast on the dark
 * chip.
 */
export const AUDIT_SEVERITY_CHIP: Record<AuditSeverity, string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-muted text-amber-700 dark:text-amber-400",
  critical: "bg-muted text-red-700 dark:text-red-400",
  error: "bg-muted text-red-700 dark:text-red-400",
};

export function auditSeverityChip(severity: string | null | undefined): string {
  return AUDIT_SEVERITY_CHIP[(severity as AuditSeverity) ?? "info"] ?? AUDIT_SEVERITY_CHIP.info;
}

export function auditSeverityLabel(severity: string | null | undefined): string {
  return AUDIT_SEVERITY_LABELS[(severity as AuditSeverity) ?? "info"] ?? "Info";
}
