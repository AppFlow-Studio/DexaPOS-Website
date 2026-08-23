"use client";

import { Check, CircleCheck, ImageOff, Loader2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { SetSiteLogo, UpdateSiteSettings } from "@/app/dashboard/website/actions/site";
import AssetPicker from "../builder/AssetPicker";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import {
  catalogFontsHref,
  findFontByStack,
  fontsForRole,
  stackFor,
  type SiteFont,
} from "@/lib/site-builder/fonts";
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
import ColorPicker from "../shell/ColorPicker";
import OverlayChrome, { OverlayRail, OverlayStage } from "../shell/OverlayChrome";
import ThemePreview from "./design/ThemePreview";

/**
 * Every heading-capable face, grouped by category for the picker.
 *
 * Built once at module scope rather than per render: the catalogue is a
 * constant, and regrouping twenty faces on every keystroke of the colour field
 * would be work done for nothing.
 */
const HEADING_FONT_GROUPS: { category: string; fonts: SiteFont[] }[] = (() => {
  const groups = new Map<string, SiteFont[]>();
  for (const font of fontsForRole("heading")) {
    const bucket = groups.get(font.category);
    if (bucket) bucket.push(font);
    else groups.set(font.category, [font]);
  }
  return [...groups].map(([category, fonts]) => ({ category, fonts }));
})();

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
 * The theme maths lives in `lib/site-builder/style-inputs.ts` — pure, shared
 * with the test that asserts the readability invariant, and free of React. This
 * component holds nothing but the five inputs: the half-typed hex that used to
 * live here now belongs to `ColorPicker`, which is the only thing that needs to
 * know the difference between a colour and a colour someone is still typing.
 */

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

  const [saved, setSaved] = useState<StyleInputs>(() => readStyleInputs(stored));
  const [draft, setDraft] = useState<StyleInputs>(saved);
  const [logoAsset, setLogoAsset] = useState<{ assetId: string; alt?: string } | undefined>(
    website.logo_asset_id ? { assetId: website.logo_asset_id } : undefined,
  );

  const theme = useMemo(() => composeTheme(draft), [draft]);
  const dirty = !same(draft, saved);

  const patch = (next: Partial<StyleInputs>) => setDraft((current) => ({ ...current, ...next }));

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
  /**
   * The catalogue entry the theme currently holds, if it is one we know.
   *
   * A theme can carry a stack from before this catalogue existed, in which case
   * there is nothing to select and the trigger shows its placeholder — the
   * merchant's stored font still renders, it simply is not one of ours.
   */
  const selectedHeadingFont = findFontByStack(draft.headingFont);

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
              {/*
                The button that spent three phases explaining why it did
                nothing. It now sets `merchant_sites.logo_asset_id`, saved on
                the spot rather than with the rest of the style: it is a
                different column and a different kind of change, and a merchant
                who picks a logo and closes the panel should keep it.
              */}
              <div className="mt-2">
                <AssetPicker
                  label=""
                  clerkOrgId={clerkOrgId}
                  value={logoAsset}
                  onChange={async (next) => {
                    setLogoAsset(next);
                    const result = await SetSiteLogo(clerkOrgId, website.id, next?.assetId ?? null);
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(next ? "Logo updated." : "Logo removed.");
                  }}
                />
              </div>
              {!logoAsset && logoUrl && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  Your website is currently showing the logo from your online store branding. Choose
                  one here to use a different logo on your website.
                </p>
              )}
            </Field>

            <Field label="Brand Color">
              <ColorPicker
                label="Brand colour"
                value={draft.brand}
                onChange={(brand) => patch({ brand })}
              />
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

                {/*
                  The rest of the catalogue, for merchants who want something
                  the three shortcuts do not cover.

                  It lists every heading-capable face **including** the three
                  above rather than only the others. Hiding them would mean the
                  control could sit on "More fonts…" while Inter was in fact
                  selected, and a picker that does not show the current value is
                  worse than a slightly redundant one.

                  Nothing has to be done to make a choice here work publicly:
                  `PageRenderer` builds its Google Fonts href from whatever two
                  stacks the theme holds, so any catalogue face loads on the
                  live page the moment it is saved.
                */}
                <Select
                  value={selectedHeadingFont?.id ?? ""}
                  onValueChange={(id) => patch({ headingFont: stackFor(id) })}
                >
                  <SelectTrigger
                    aria-label="More title fonts"
                    className={cn("w-full", custom && "border-primary/40 bg-accent font-medium")}
                  >
                    <SelectValue placeholder="More fonts…" />
                  </SelectTrigger>
                  <SelectContent>
                    {HEADING_FONT_GROUPS.map((group) => (
                      <SelectGroup key={group.category}>
                        <SelectLabel>{group.category}</SelectLabel>
                        {group.fonts.map((font) => (
                          <SelectItem key={font.id} value={font.id}>
                            {/* The name in its own face — a type picker that
                                shows every option in the same font is asking a
                                merchant to choose blind. */}
                            <span style={{ fontFamily: font.stack }}>{font.name}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
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

function same(a: StyleInputs, b: StyleInputs): boolean {
  return (
    a.brand === b.brand &&
    a.mode === b.mode &&
    a.corner === b.corner &&
    a.headingFont === b.headingFont &&
    a.fontFamily === b.fontFamily
  );
}
