"use client";

import { Monitor, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ThemeTokens } from "@/lib/site-builder/render-context";

export type PreviewDevice = "desktop" | "mobile";

/**
 * A miniature restaurant page painted entirely from theme tokens.
 *
 * Deliberately exercises *every* token, not just the four a merchant picks:
 * the dark hero band, the muted band, the border colour and the muted footer all
 * appear, so a palette whose supporting colours are wrong is visible here rather
 * than after publishing. Nothing in this component hardcodes a colour.
 *
 * **Each band must use the token the real section uses.** This drifted once: the
 * footer was painted with `surfaceDark`, which is dark in light *and* dark mode,
 * so toggling the mode appeared to leave the footer unchanged — while the real
 * `FooterSection`, on `surfaceMuted`, had been inverting correctly all along.
 * A preview that disagrees with the renderer is worse than no preview.
 *
 * **The content is the merchant's own.** It used to be furniture — a nav of
 * `Menu · About · Contact` against a site whose real pages are `Home · About
 * us · Careers`, three grey boxes labelled "Signature plate", "House favourite"
 * and "Chef's pick". A merchant judging their own colours was reading someone
 * else's restaurant, and the grey boxes read as broken images rather than as
 * placeholders. The nav and the dishes come in as props now; the invented
 * strings survive only as the fallback for a site that genuinely has neither.
 */
export default function ThemePreview({
  theme,
  device,
  restaurantName,
  nav = [],
  items = [],
}: {
  theme: ThemeTokens;
  device: PreviewDevice;
  restaurantName: string;
  /** The merchant's real navigation labels, in order. */
  nav?: string[];
  /** A few real dishes — name, and a photo where the merchant has one. */
  items?: { name: string; image: string | null }[];
}) {
  const heading = { fontFamily: theme.headingFont || theme.fontFamily };
  const mobile = device === "mobile";

  // A brand-new site has neither, and an empty header would show less about the
  // theme than a populated one does.
  const navLabels = (nav.length > 0 ? nav : ["Menu", "About", "Contact"]).slice(0, 3);
  const dishes = (
    items.length > 0
      ? items
      : [
          { name: "Signature plate", image: null },
          { name: "House favorite", image: null },
          { name: "Chef's pick", image: null },
        ]
  ).slice(0, mobile ? 2 : 3);

  return (
    <div
      className={cn(
        // `ring-1` on top of the themed border: the border is the *site's*
        // colour and can sit invisibly close to the app's own surface in dark
        // mode, so a neutral hairline guarantees the frame exists whatever the
        // merchant picks.
        "mx-auto w-full overflow-hidden border shadow-sm ring-1 ring-border transition-[max-width] duration-300",
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
            {navLabels.map((label) => (
              <span key={label} className="max-w-20 truncate">
                {label}
              </span>
            ))}
            <span
              className="px-2.5 py-1 text-[10px] font-semibold"
              style={{ background: theme.brand, color: theme.brandContrast, borderRadius: theme.radius }}
            >
              Order Online
            </span>
          </span>
        )}
      </div>

      {/* Hero — the dark band, as `classic`/`spotlight` render it */}
      <div className="px-5 py-6" style={{ background: theme.surfaceDark, color: theme.textOnDark }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">Made fresh daily</p>
        <p className={cn("mt-2 font-bold leading-tight", mobile ? "text-xl" : "text-2xl")} style={heading}>
          Food worth coming back for.
        </p>
        <p className="mt-2 text-xs leading-5 opacity-90">
          A short line that tells guests what makes your restaurant worth the trip.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* `CtaButton`, primary and secondary. */}
          <span
            className="px-3.5 py-2 text-xs font-semibold"
            style={{ background: theme.brand, color: theme.brandContrast, borderRadius: theme.radius }}
          >
            Order Online
          </span>
          <span
            className="border px-3.5 py-2 text-xs font-semibold"
            style={{ borderColor: "currentColor", borderRadius: theme.radius }}
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
          {dishes.map((dish) => (
            <div
              key={dish.name}
              className="border p-2.5"
              style={{ background: theme.card, borderColor: theme.border, borderRadius: theme.radius }}
            >
              <div
                className="mb-2 aspect-[4/3] w-full overflow-hidden"
                style={{ background: theme.surfaceMuted, borderRadius: `calc(${theme.radius} / 1.6)` }}
              >
                {dish.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
                  <img
                    src={dish.image}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <p className="truncate text-[11px] font-semibold" style={heading}>
                {dish.name}
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

      {/* Footer — muted band over a top border, exactly as `FooterSection` paints it */}
      <div
        className="border-t px-5 py-4"
        style={{ background: theme.surfaceMuted, color: theme.text, borderColor: theme.border }}
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
