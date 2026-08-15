"use client";

import { Monitor, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ThemeTokens } from "@/lib/site-builder/render-context";

export type PreviewDevice = "desktop" | "mobile";

/**
 * A miniature restaurant page painted entirely from theme tokens.
 *
 * Deliberately exercises *every* token, not just the four a merchant picks:
 * the muted band, the border colour, and the dark footer all appear, so a
 * palette whose supporting colours are wrong is visible here rather than after
 * publishing. Nothing in this component hardcodes a colour.
 */
export default function ThemePreview({
  theme,
  device,
  restaurantName,
}: {
  theme: ThemeTokens;
  device: PreviewDevice;
  restaurantName: string;
}) {
  const heading = { fontFamily: theme.headingFont || theme.fontFamily };
  const mobile = device === "mobile";

  return (
    <div
      className={cn(
        "mx-auto w-full overflow-hidden border shadow-sm transition-[max-width] duration-300",
        mobile ? "max-w-[320px]" : "max-w-none",
      )}
      style={{
        background: theme.surface,
        color: theme.text,
        fontFamily: theme.fontFamily,
        borderColor: theme.border,
        borderRadius: theme.radius,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
        style={{ borderColor: theme.border }}
      >
        <span className="truncate text-[11px] font-bold uppercase tracking-wide" style={heading}>
          {restaurantName}
        </span>
        {mobile ? (
          <span className="flex flex-col gap-[3px]" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-[2px] w-4 rounded-full" style={{ background: theme.textMuted }} />
            ))}
          </span>
        ) : (
          <span className="flex items-center gap-3 text-[10px]" style={{ color: theme.textMuted }}>
            <span>Menu</span>
            <span>About</span>
            <span>Contact</span>
            <span
              className="px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: theme.brand, color: theme.brandContrast, borderRadius: theme.radius }}
            >
              Order Online
            </span>
          </span>
        )}
      </div>

      {/* Hero */}
      <div className="px-5 py-6" style={{ background: theme.brand, color: theme.brandContrast }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">Made fresh daily</p>
        <p className={cn("mt-2 font-bold leading-tight", mobile ? "text-xl" : "text-2xl")} style={heading}>
          Food worth coming back for.
        </p>
        <p className="mt-2 text-xs leading-5 opacity-90">
          A short line that tells guests what makes your restaurant worth the trip.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span
            className="px-3.5 py-2 text-xs font-semibold"
            style={{ background: theme.card, color: theme.text, borderRadius: theme.radius }}
          >
            Order Online
          </span>
          <span
            className="border px-3.5 py-2 text-xs font-semibold"
            style={{ borderColor: theme.brandContrast, color: theme.brandContrast, borderRadius: theme.radius }}
          >
            View Menu
          </span>
        </div>
      </div>

      {/* Featured items on the muted band */}
      <div className="px-5 py-5" style={{ background: theme.surfaceMuted }}>
        <p className="text-sm font-bold" style={heading}>
          Guest favourites
        </p>
        <p className="mt-1 text-[11px]" style={{ color: theme.textMuted }}>
          The dishes people come back for.
        </p>
        <div className={cn("mt-3 grid gap-2", mobile ? "grid-cols-2" : "grid-cols-3")}>
          {["Signature plate", "House favourite", "Chef's pick"]
            .slice(0, mobile ? 2 : 3)
            .map((label) => (
              <div
                key={label}
                className="border p-2.5"
                style={{ background: theme.card, borderColor: theme.border, borderRadius: theme.radius }}
              >
                <div
                  className="mb-2 aspect-[4/3] w-full"
                  style={{ background: theme.surfaceMuted, borderRadius: `calc(${theme.radius} / 1.6)` }}
                />
                <p className="truncate text-[11px] font-semibold" style={heading}>
                  {label}
                </p>
                <p className="mt-0.5 text-[10px]" style={{ color: theme.textMuted }}>
                  Made to order
                </p>
              </div>
            ))}
        </div>
      </div>

      {/* Body copy, to show the body face at reading size */}
      <div className="px-5 py-5">
        <p className="text-sm font-bold" style={heading}>
          Our story
        </p>
        <p className="mt-1.5 text-[11px] leading-[1.7]" style={{ color: theme.textMuted }}>
          We have been serving the neighbourhood since 2014. Everything on the menu is prepared in
          house each morning, and we are open seven days a week for dine-in and takeout.
        </p>
      </div>

      {/* Footer on the dark band */}
      <div
        className="px-5 py-4"
        style={{ background: theme.surfaceDark, color: theme.textOnDark }}
      >
        <p className="text-[11px] font-bold" style={heading}>
          {restaurantName}
        </p>
        <p className="mt-1 text-[10px] opacity-75">
          Open daily 11:00 – 22:00 · (555) 010-3400
        </p>
      </div>
    </div>
  );
}

/** Desktop / mobile switch for the preview pane. */
export function DeviceToggle({
  device,
  onChange,
}: {
  device: PreviewDevice;
  onChange: (device: PreviewDevice) => void;
}) {
  const options: { id: PreviewDevice; label: string; icon: typeof Monitor }[] = [
    { id: "desktop", label: "Desktop", icon: Monitor },
    { id: "mobile", label: "Mobile", icon: Smartphone },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5" role="group" aria-label="Preview size">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={device === id}
          title={`${label} preview`}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            device === id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
