"use client";

interface QrTableBannerProps {
  tableLabel: string | null | undefined;
  message?: string;
  className?: string;
}

export function QrTableBanner({
  tableLabel,
  message = "This table is locked for this order. Your food will be runner-delivered after payment.",
  className = "",
}: QrTableBannerProps) {
  if (!tableLabel) return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${className}`.trim()}
      style={{
        borderColor: "color-mix(in srgb, var(--primary) 28%, #D6E4FF)",
        backgroundColor: "color-mix(in srgb, var(--primary) 6%, #FFFFFF)",
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-[0.18em]"
        style={{ color: "var(--primary)" }}
      >
        QR Table Ordering
      </p>
      <p
        className="mt-1 text-base font-semibold"
        style={{ color: "var(--text)" }}
      >
        Ordering for Table {tableLabel}
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
        {message}
      </p>
    </div>
  );
}
