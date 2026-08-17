"use client";

import { Check, CircleCheck, ImageOff, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { UpdateSiteSettings } from "@/app/dashboard/website/actions/site";
import { Button } from "@/components/ui/button";
import { isHexColor } from "@/lib/site-builder/color";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import { catalogFontsHref, findFontByStack, stackFor } from "@/lib/site-builder/fonts";
import { resolveTheme, type ThemeTokens } from "@/lib/site-builder/render-context";
import {
  composeTheme,
  isCustomTitleFont,
  readStyleInputs,
  TITLE_FONTS,
  type StyleCorner,
  type StyleInputs,
  type StyleMode,
} from "@/lib/site-builder/style-inputs";
import { cn } from "@/lib/utils";
import { websiteRoutes } from "../routes";
import OverlayChrome, { OverlayRail, OverlayStage } from "../shell/OverlayChrome";
import ThemePreview from "./design/ThemePreview";

/**
 * The whole design system, in five controls.
 *
 * This replaced an 820-line workspace with four tabs: eight palettes behind
 * mood filters, ten individually overridable colours, twelve font pairings, two
 * font pickers over sixteen families, four corner radii, a WCAG readability
 * panel and a navigation editor. Every part of it was good. Together they asked
 * a restaurant owner to be an art director.
 *
 * **One brand colour drives everything.** `deriveThemeColors` already computed
 * the supporting palette from three inputs; giving it a fixed pair for light and
 * dark reduces those three to one. A merchant cannot now choose a text colour
 * that disappears on their background, which is what the readability panel
 * existed to warn about — the warning is replaced by an invariant, and an
 * invariant is better than a warning.
 *
 * The full `ThemeTokens` object is still what gets stored, so the renderer,
 * `SiteChrome` and every section are untouched. No migration, no schema change.
 */

/**
 * The five inputs, plus whatever is literally in the hex field.
 *
 * The theme maths lives in `lib/site-builder/style-inputs.ts` — pure, shared
 * with the test that asserts the readability invariant, and free of React. This
 * component owns only the half-typed hex value, which is a text-input concern
 * and nothing else's business.
 */
interface StyleDraft extends StyleInputs {
  brandDraft: string;
}

export default function StyleOverlay({
  clerkOrgId,
  locationId,
  website,
  fallbackTheme,
  siteName = "Your Restaurant",
  logoUrl = null,
}: {
  clerkOrgId: string;
  locationId: string;
  website: MerchantSiteRow;
  fallbackTheme: Partial<ThemeTokens>;
  siteName?: string;
  /**
   * From the storefront's branding, not the site row — `merchant_sites` has no
   * logo column, and the header already renders this one.
   */
  logoUrl?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const stored = useMemo(
    () => resolveTheme(website.theme as Partial<ThemeTokens> | null, fallbackTheme),
    [website.theme, fallbackTheme],
  );

  const [saved, setSaved] = useState<StyleDraft>(() => withDraft(readStyleInputs(stored)));
  const [draft, setDraft] = useState<StyleDraft>(saved);

  const theme = useMemo(() => composeTheme(draft), [draft]);
  const dirty = !same(draft, saved);

  const patch = (next: Partial<StyleDraft>) => setDraft((current) => ({ ...current, ...next }));

  const setBrand = (raw: string) => {
    const typed = raw.toUpperCase();
    // A half-typed value stays in the field but never reaches the theme, so the
    // preview does not flash through black on the way to a colour.
    patch(isHexColor(typed) ? { brand: typed, brandDraft: typed } : { brandDraft: typed });
  };

  const save = () => {
    startTransition(async () => {
      const result = await UpdateSiteSettings(clerkOrgId, website.id, { theme });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSaved(draft);
      toast.success("Your website style is saved.");
    });
  };

  const custom = isCustomTitleFont(draft.headingFont);

  return (
    <OverlayChrome
      title="Style"
      closeHref={websiteRoutes.pages(locationId)}
      action={
        <Button size="sm" disabled={!dirty || pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
          {!pending && <Check className="size-4" />}
        </Button>
      }
    >
      {/*
        Every typeface in the catalogue, loaded for this screen only: the four
        title options are live specimens, and a specimen shown in a font that is
        not loaded is a lie in a different shape. Public pages load only the two
        families their theme actually uses.
      */}
      <link rel="stylesheet" href={catalogFontsHref()} precedence="site-font-catalog" />

      <div className="flex h-full min-h-0">
        <OverlayRail>
          <div className="space-y-6 p-4">
            <Field label="Logo">
              <div className="flex h-24 items-center justify-center rounded-md border bg-muted/40">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- merchant CDN host
                  <img
                    src={logoUrl}
                    alt=""
                    className="max-h-16 max-w-[80%] object-contain"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageOff className="size-4" />
                    <span className="text-[11px]">No logo yet</span>
                  </span>
                )}
              </div>
              {/* Not a disabled button pretending to work: the asset library is
                  Stage 7, and a Replace that silently does nothing is worse than
                  one sentence saying where logos come from today. */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Your logo comes from your online store branding. Uploading one here arrives with the
                asset library.
              </p>
            </Field>

            <Field label="Brand Color">
              <div className="flex items-center gap-2">
                <label
                  className="relative flex h-9 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50"
                  title="Choose your brand colour"
                >
                  <span className="absolute inset-1 rounded-sm" style={{ background: draft.brand }} />
                  <input
                    type="color"
                    value={draft.brand}
                    onChange={(event) => setBrand(event.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Choose your brand colour"
                  />
                </label>
                <input
                  value={draft.brandDraft}
                  onChange={(event) => setBrand(event.target.value)}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Brand colour"
                  aria-invalid={!isHexColor(draft.brandDraft)}
                  className={cn(
                    "h-9 min-w-0 flex-1 rounded-md border bg-transparent px-3 font-mono text-sm uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    !isHexColor(draft.brandDraft) && "border-destructive",
                  )}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Buttons, links and the hero band. Everything else is calculated from it.
              </p>
            </Field>

            <Field label="Theme">
              <Segmented
                value={draft.mode}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                onChange={(mode) => patch({ mode })}
              />
            </Field>

            <Field label="Corners">
              <Segmented
                value={draft.corner}
                options={[
                  { value: "rounded", label: "Rounded" },
                  { value: "square", label: "Square" },
                ]}
                onChange={(corner) => patch({ corner })}
              />
            </Field>

            <Field label="Titles font">
              <div role="radiogroup" aria-label="Titles font" className="space-y-1.5">
                {TITLE_FONTS.map((font) => {
                  const stack = stackFor(font.fontId);
                  const selected = draft.headingFont === stack;
                  return (
                    <button
                      key={font.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => patch({ headingFont: stack })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        selected
                          ? "border-primary/40 bg-accent font-medium"
                          : "hover:border-foreground/25 hover:bg-accent/40",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{font.label}</span>
                      <span className="shrink-0 text-base" style={{ fontFamily: stack }}>
                        Aa
                      </span>
                      {selected && <CircleCheck className="size-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}

                {/* Present only when it applies. A merchant who has never had a
                    custom face does not need a row telling them so. */}
                {custom && (
                  <div className="flex w-full items-center gap-2 rounded-md border border-primary/40 bg-accent px-3 py-2 text-sm font-medium">
                    <span className="min-w-0 flex-1 truncate">Custom</span>
                    <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                      {findFontByStack(draft.headingFont)?.name ?? "Custom font"}
                    </span>
                    <CircleCheck className="size-4 shrink-0 text-primary" />
                  </div>
                )}
              </div>
            </Field>
          </div>
        </OverlayRail>

        <OverlayStage>
          <div className="mx-auto w-full max-w-3xl">
            <ThemePreview theme={theme} device="desktop" restaurantName={siteName} />
          </div>
        </OverlayStage>
      </div>
    </OverlayChrome>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function withDraft(inputs: StyleInputs): StyleDraft {
  return { ...inputs, brandDraft: inputs.brand };
}

function same(a: StyleDraft, b: StyleDraft): boolean {
  return (
    a.brand === b.brand &&
    a.mode === b.mode &&
    a.corner === b.corner &&
    a.headingFont === b.headingFont &&
    a.fontFamily === b.fontFamily
  );
}
