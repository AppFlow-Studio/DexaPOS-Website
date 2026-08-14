/**
 * Single source of truth for audit-log `severity` presentation.
 *
 * Mirrors the shape of `PAYMENT_STATUS_STYLES` in `payment-status.ts` — a dot,
 * a text colour and a tint — so every status/severity badge in the product
 * reads as one system. Replaces the `text-primary` (violet, not brand blue —
 * see UI-DESIGN-SYSTEM.md C5) and ad-hoc red/amber pairs the audit log
 * previously carried in `lib/audit/sentence-templates.ts`.
 */

export interface BadgeStyle {
  dot: string;
  text: string;
  bg: string;
}

export type AuditSeverity = "info" | "warning" | "critical" | "error";

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
  error: "Error",
};

export const AUDIT_SEVERITY_STYLES: Record<AuditSeverity, BadgeStyle> = {
  info: {
    dot: "bg-[#0C4FD1] dark:bg-[#6CA0FF]",
    text: "text-[#0C4FD1] dark:text-[#6CA0FF]",
    bg: "bg-[#0C4FD1]/10 dark:bg-[#6CA0FF]/10",
  },
  warning: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  critical: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
  error: {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
  },
};

/** Card left-border tint — deliberately transparent for `info` so only real issues draw the eye. */
export const AUDIT_SEVERITY_BORDER: Record<AuditSeverity, string> = {
  info: "border-l-transparent",
  warning: "border-l-amber-400",
  critical: "border-l-red-500",
  error: "border-l-red-500",
};

export function auditSeverityStyle(severity: string | null | undefined): BadgeStyle {
  return AUDIT_SEVERITY_STYLES[(severity as AuditSeverity) ?? "info"] ?? AUDIT_SEVERITY_STYLES.info;
}

export function auditSeverityLabel(severity: string | null | undefined): string {
  return AUDIT_SEVERITY_LABELS[(severity as AuditSeverity) ?? "info"] ?? "Info";
}

export function auditSeverityBorder(severity: string | null | undefined): string {
  return AUDIT_SEVERITY_BORDER[(severity as AuditSeverity) ?? "info"] ?? AUDIT_SEVERITY_BORDER.info;
}
