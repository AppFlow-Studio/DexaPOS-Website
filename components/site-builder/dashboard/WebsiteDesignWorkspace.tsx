"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Eye,
  Loader2,
  Palette,
  PencilLine,
  RotateCcw,
  Save,
  Shapes,
  Sparkles,
  Type,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { UpdateSiteSettings } from "@/app/dashboard/website/actions/site";
import ColorField from "@/components/site-builder/dashboard/design/ColorField";
import FontPicker from "@/components/site-builder/dashboard/design/FontPicker";
import ReadabilityCheck, { readabilityProblems } from "@/components/site-builder/dashboard/design/ReadabilityCheck";
import ThemePreview, { DeviceToggle, type PreviewDevice } from "@/components/site-builder/dashboard/design/ThemePreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  THEME_COLOR_KEYS,
  deriveThemeColors,
  isHexColor,
  type ThemeColorKey,
  type ThemeColors,
} from "@/lib/site-builder/color";
import type { MerchantSiteRow } from "@/lib/site-builder/db-types";
import {
  FONT_PAIRINGS,
  catalogFontsHref,
  findFontByStack,
  stackFor,
  type FontPairing,
} from "@/lib/site-builder/fonts";
import {
  PALETTE_MOODS,
  SITE_PALETTES,
  matchPalette,
  paletteColors,
  type PaletteMood,
  type SitePalette,
} from "@/lib/site-builder/palettes";
import { DEFAULT_THEME, resolveTheme, type ThemeTokens } from "@/lib/site-builder/render-context";
import { cn } from "@/lib/utils";

/**
 * The three colours a merchant is asked for. Everything else in the palette is
 * derived from these, so editing one of them re-derives the rest.
 */
const CORE_COLORS: { key: "brand" | "surface" | "text"; label: string; help: string }[] = [
  { key: "brand", label: "Brand colour", help: "Buttons, links, and the hero band. Usually your logo's main colour." },
  { key: "surface", label: "Page background", help: "The base colour behind every page. A dark value creates a dark site." },
  { key: "text", label: "Text colour", help: "Headings and body copy. Should contrast strongly with the background." },
];

const SUPPORTING_COLORS: { key: ThemeColorKey; label: string; help: string }[] = [
  { key: "brandContrast", label: "Text on brand", help: "Sits on top of the brand colour, such as button labels." },
  { key: "card", label: "Content cards", help: "Menu item cards, information panels, and tiles." },
  { key: "surfaceMuted", label: "Alternating band", help: "Sections that need to separate from the page background." },
  { key: "border", label: "Borders & dividers", help: "Hairlines around cards and between sections." },
  { key: "textMuted", label: "Secondary text", help: "Descriptions, captions, and hours." },
  { key: "surfaceDark", label: "Footer band", help: "The dark strip at the bottom of every page." },
  { key: "textOnDark", label: "Footer text", help: "Sits on top of the footer band." },
];

const RADIUS_OPTIONS = [
  { value: "2px", label: "Square", help: "Architectural and precise" },
  { value: "6px", label: "Sharp", help: "Lightly softened, business-like" },
  { value: "12px", label: "Balanced", help: "Modern and versatile — recommended" },
  { value: "20px", label: "Soft", help: "Friendly and approachable" },
] as const;

/** The unsaved theme plus the literal text sitting in each hex field. */
interface DesignDraft {
  theme: ThemeTokens;
  drafts: Record<ThemeColorKey, string>;
}

type Props = {
  clerkOrgId: string;
  locationId: string;
  website: MerchantSiteRow;
  fallbackTheme: Partial<ThemeTokens>;
  siteName?: string;
};

export default function WebsiteDesignWorkspace({
  clerkOrgId,
  locationId,
  website,
  fallbackTheme,
  siteName = "Your Restaurant",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const initialTheme = useMemo(
    () => resolveTheme(website.theme as Partial<ThemeTokens> | null, fallbackTheme),
    [fallbackTheme, website.theme],
  );

  const [savedTheme, setSavedTheme] = useState<ThemeTokens>(initialTheme);
  // Theme and the raw text in the hex fields move together in one state object:
  // editing a core colour has to rewrite both at once, and splitting them means
  // one setState updater calling another, which React may replay.
  const [{ theme, drafts }, setDraft] = useState<DesignDraft>(() => ({
    theme: initialTheme,
    drafts: colorDrafts(initialTheme),
  }));
  const [mood, setMood] = useState<PaletteMood | "all">("all");
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  const builderHref = `/dashboard/website/builder?location=${encodeURIComponent(locationId)}`;
  const previewHref = `/dashboard/website/preview?location=${encodeURIComponent(locationId)}`;

  const activePalette = useMemo(() => matchPalette(theme), [theme]);
  const activePairing = useMemo(
    () =>
      FONT_PAIRINGS.find(
        (pairing) =>
          stackFor(pairing.headingId) === theme.headingFont && stackFor(pairing.bodyId) === theme.fontFamily,
      ) ?? null,
    [theme.headingFont, theme.fontFamily],
  );

  const visiblePalettes = mood === "all" ? SITE_PALETTES : SITE_PALETTES.filter((p) => p.mood === mood);
  const invalidColors = THEME_COLOR_KEYS.filter((key) => !isHexColor(drafts[key]));
  const hasDraftDrift = THEME_COLOR_KEYS.some((key) => drafts[key] !== theme[key].toUpperCase());
  const isDirty = !sameTheme(theme, savedTheme) || hasDraftDrift;
  const canSave = isDirty && invalidColors.length === 0 && !pending;
  const problems = readabilityProblems(theme);

  /** Writes a colour and, for the three core roles, re-derives everything else. */
  const updateColor = useCallback((key: ThemeColorKey, raw: string) => {
    setDraft((current) => {
      const typed = raw.toUpperCase();
      const withTyped = { ...current.drafts, [key]: typed };
      // An incomplete value still shows in the field; it just does not reach the
      // theme, so the preview never flashes through half-typed colours.
      if (!isHexColor(typed)) return { theme: current.theme, drafts: withTyped };

      const isCore = key === "brand" || key === "surface" || key === "text";
      if (!isCore) return { theme: { ...current.theme, [key]: typed }, drafts: withTyped };

      // Supporting colours are a function of the core three. Recomputing them
      // here is what keeps a dark background from keeping light-grey borders.
      const derived = deriveThemeColors({
        brand: key === "brand" ? typed : current.theme.brand,
        surface: key === "surface" ? typed : current.theme.surface,
        text: key === "text" ? typed : current.theme.text,
      });
      return { theme: { ...current.theme, ...derived }, drafts: colorDrafts(derived) };
    });
  }, []);

  const patchTheme = useCallback((patch: Partial<ThemeTokens>) => {
    setDraft((current) => ({ theme: { ...current.theme, ...patch }, drafts: current.drafts }));
  }, []);

  const applyPalette = useCallback((palette: SitePalette) => {
    const colors = paletteColors(palette);
    setDraft((current) => ({ theme: { ...current.theme, ...colors }, drafts: colorDrafts(colors) }));
  }, []);

  const applyPairing = useCallback(
    (pairing: FontPairing) => {
      patchTheme({ headingFont: stackFor(pairing.headingId), fontFamily: stackFor(pairing.bodyId) });
    },
    [patchTheme],
  );

  /** Picks a palette + pairing the merchant is not already using. */
  const inspireMe = useCallback(() => {
    const palettes = SITE_PALETTES.filter((p) => p.id !== activePalette?.id);
    const pairings = FONT_PAIRINGS.filter((p) => p.id !== activePairing?.id && p.id !== "system-default");
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const pairing = pairings[Math.floor(Math.random() * pairings.length)];
    applyPalette(palette);
    applyPairing(pairing);
    toast.message(`${palette.name} · ${pairing.name}`, {
      description: "Try another, or save if you like it.",
    });
  }, [activePalette?.id, activePairing?.id, applyPalette, applyPairing]);

  const discardChanges = () => {
    setDraft({ theme: savedTheme, drafts: colorDrafts(savedTheme) });
    toast.message("Unsaved design changes discarded");
  };

  const restoreDefaults = () => {
    setDraft({ theme: DEFAULT_THEME, drafts: colorDrafts(DEFAULT_THEME) });
    toast.message("DexaPOS defaults applied. Save to keep them.");
  };

  const save = () => {
    if (!canSave) return;
    startTransition(async () => {
      try {
        const result = await UpdateSiteSettings(clerkOrgId, website.id, { theme });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setSavedTheme(theme);
        toast.success("Site-wide design saved");
        router.refresh();
      } catch {
        toast.error("Could not save the design. Try again.");
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8 lg:pb-28">
      {/*
        Every typeface in the catalogue, loaded once for this page only: the
        pairing cards and the font pickers are live specimens, and a specimen in
        a font that is not present is just a lie in a different shape. Public
        pages load only the two families their theme uses.
      */}
      <link rel="stylesheet" href={catalogFontsHref()} precedence="site-font-catalog" />

      <header className="space-y-5 border-b pb-6">
        <Button variant="ghost" size="sm" className="-ml-3" asChild>
          <Link href="/dashboard/website">
            <ArrowLeft className="h-4 w-4" />
            Back to Website
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Site-wide design</h1>
              <Badge variant={isDirty ? "secondary" : "outline"}>
                {isDirty ? "Unsaved changes" : "All changes saved"}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
              Colours, typography, and corner style for every page of your website. Page copy, photos,
              and sections are edited separately in the page editor.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={inspireMe} disabled={pending}>
              <Sparkles className="h-4 w-4" />
              Inspire me
            </Button>
            <Button variant="outline" asChild>
              <Link href={builderHref}>
                <PencilLine className="h-4 w-4" />
                Edit page content
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={previewHref} target="_blank">
                <ExternalLink className="h-4 w-4" />
                Full preview
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_min(46%,560px)]">
        {/* Preview leads on narrow screens: choosing a palette blind is the one
            thing this page must never ask a merchant to do. */}
        <aside className="order-1 space-y-4 xl:order-2 xl:sticky xl:top-6">
          <Card className="overflow-hidden py-0 gap-0">
            <CardHeader className="border-b bg-muted/30 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Live preview</CardTitle>
                </div>
                <DeviceToggle device={device} onChange={setDevice} />
              </div>
            </CardHeader>
            <CardContent className="bg-muted/20 p-4 sm:p-5">
              <ThemePreview theme={theme} device={device} restaurantName={siteName} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Readability</CardTitle>
                <Badge variant={problems === 0 ? "outline" : "secondary"} className="shrink-0">
                  {problems === 0 ? "All checks pass" : `${problems} to review`}
                </Badge>
              </div>
              <CardDescription>
                Contrast between text and its background, measured the way accessibility tools do.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReadabilityCheck theme={theme} />
            </CardContent>
          </Card>
        </aside>

        <main className="order-2 min-w-0 xl:order-1">
          <Tabs defaultValue="palette" className="gap-5">
            <TabsList className="h-auto w-full justify-start gap-1 p-1">
              <TabsTrigger value="palette" className="flex-1 gap-2 py-2">
                <Palette className="h-4 w-4" />
                Colours
              </TabsTrigger>
              <TabsTrigger value="typography" className="flex-1 gap-2 py-2">
                <Type className="h-4 w-4" />
                Typography
              </TabsTrigger>
              <TabsTrigger value="shape" className="flex-1 gap-2 py-2">
                <Shapes className="h-4 w-4" />
                Shape
              </TabsTrigger>
            </TabsList>

            {/* ── Colours ───────────────────────────────────────────── */}
            <TabsContent value="palette" className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Choose a palette</CardTitle>
                  <CardDescription>
                    Each palette is a complete, tested colour system — background, cards, borders, and
                    footer included. Pick one, then fine-tune below if you need to.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter palettes by mood">
                    <MoodChip active={mood === "all"} onClick={() => setMood("all")} label="All" hint="Every palette" />
                    {PALETTE_MOODS.map((option) => (
                      <MoodChip
                        key={option.id}
                        active={mood === option.id}
                        onClick={() => setMood(option.id)}
                        label={option.label}
                        hint={option.hint}
                      />
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {visiblePalettes.map((palette) => (
                      <PaletteCard
                        key={palette.id}
                        palette={palette}
                        selected={activePalette?.id === palette.id}
                        onSelect={() => applyPalette(palette)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Fine-tune your colours</CardTitle>
                  <CardDescription>
                    Change any of these three and the supporting colours — cards, borders, footer —
                    are recalculated to match.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {CORE_COLORS.map(({ key, label, help }) => (
                      <ColorField
                        key={key}
                        id={`color-${key}`}
                        label={label}
                        help={help}
                        value={theme[key]}
                        draft={drafts[key]}
                        onChange={(next) => updateColor(key, next)}
                      />
                    ))}
                  </div>

                  <Collapsible>
                    <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg border border-dashed px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                      <span>
                        <span className="block text-sm font-medium">Advanced colours</span>
                        <span className="block text-xs text-muted-foreground">
                          Override the seven supporting colours individually.
                        </span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4">
                      <p className="mb-3 rounded-md bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                        Editing brand, background, or text above will recalculate these and discard
                        overrides you set here.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {SUPPORTING_COLORS.map(({ key, label, help }) => (
                          <ColorField
                            key={key}
                            id={`color-${key}`}
                            label={label}
                            help={help}
                            value={theme[key]}
                            draft={drafts[key]}
                            onChange={(next) => updateColor(key, next)}
                          />
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Typography ────────────────────────────────────────── */}
            <TabsContent value="typography" className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Choose a font pairing</CardTitle>
                  <CardDescription>
                    A headline face and a body face chosen to work together. Each card is shown in the
                    actual typefaces your visitors will see.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FONT_PAIRINGS.map((pairing) => (
                      <PairingCard
                        key={pairing.id}
                        pairing={pairing}
                        selected={activePairing?.id === pairing.id}
                        onSelect={() => applyPairing(pairing)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Or choose each font yourself</CardTitle>
                  <CardDescription>
                    Headings and body copy can use different typefaces. Display faces are offered for
                    headings only — they are hard to read at paragraph size.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <FontPicker
                      id="heading-font"
                      role="heading"
                      label="Heading font"
                      value={theme.headingFont}
                      onChange={(headingFont) => patchTheme({ headingFont })}
                    />
                    <FontPicker
                      id="body-font"
                      role="body"
                      label="Body font"
                      value={theme.fontFamily}
                      onChange={(fontFamily) => patchTheme({ fontFamily })}
                    />
                  </div>
                  <TypeSpecimen theme={theme} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Shape ─────────────────────────────────────────────── */}
            <TabsContent value="shape" className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Corner style</CardTitle>
                  <CardDescription>
                    Applied to buttons, cards, images, and input fields across the whole website.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {RADIUS_OPTIONS.map((option) => (
                      <RadiusCard
                        key={option.value}
                        option={option}
                        theme={theme}
                        selected={theme.radius === option.value}
                        onSelect={() => patchTheme({ radius: option.value })}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Start over from the DexaPOS style?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Restoring defaults changes this draft only. Nothing goes live until you save.
                  </p>
                </div>
                <Button variant="outline" onClick={restoreDefaults} disabled={pending}>
                  <RotateCcw className="h-4 w-4" />
                  Restore defaults
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:left-[var(--sidebar-width,0px)]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm">
            {invalidColors.length > 0 ? (
              <>
                <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />
                <span className="text-destructive">Fix the invalid colour values before saving.</span>
              </>
            ) : isDirty ? (
              <>
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Unsaved changes
                  {activePalette ? ` · ${activePalette.name}` : ""}
                  {activePairing ? ` · ${activePairing.name}` : ""}
                </span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="text-muted-foreground">Your site-wide design is saved.</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={discardChanges} disabled={!isDirty || pending}>
              Discard
            </Button>
            <Button onClick={save} disabled={!canSave} className="min-w-40">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {pending ? "Saving design…" : "Save design"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MoodChip({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:border-foreground/25 hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/**
 * A palette shown as the page it produces, not as a row of equal swatches.
 *
 * The background gets the most area, the brand colour a decisive block, and the
 * card and text colours a sliver each — roughly the proportion they occupy on a
 * real page, so the card previews the outcome rather than the ingredients.
 */
function PaletteCard({
  palette,
  selected,
  onSelect,
}: {
  palette: SitePalette;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = paletteColors(palette);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected
          ? "border-primary ring-1 ring-primary"
          : "hover:border-foreground/25 hover:shadow-sm",
      )}
    >
      <span
        className="relative flex h-20 w-full flex-col justify-between p-2.5"
        style={{ background: colors.surface }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="rounded-full px-2 py-[3px] text-[9px] font-bold"
            style={{ background: colors.brand, color: colors.brandContrast }}
          >
            Order Online
          </span>
          <span className="h-1 w-6 rounded-full" style={{ background: colors.textMuted }} />
        </span>
        <span className="flex items-end gap-1.5">
          <span
            className="h-8 flex-1 rounded border"
            style={{ background: colors.card, borderColor: colors.border }}
          />
          <span
            className="h-8 flex-1 rounded border"
            style={{ background: colors.surfaceMuted, borderColor: colors.border }}
          />
          <span className="h-8 w-6 rounded" style={{ background: colors.surfaceDark }} />
        </span>
        {selected && (
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <Check className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="flex-1 border-t bg-card px-3 py-2.5">
        <span className="block text-sm font-medium">{palette.name}</span>
        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{palette.description}</span>
      </span>
    </button>
  );
}

function PairingCard({
  pairing,
  selected,
  onSelect,
}: {
  pairing: FontPairing;
  selected: boolean;
  onSelect: () => void;
}) {
  const headingStack = stackFor(pairing.headingId);
  const bodyStack = stackFor(pairing.bodyId);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/25 hover:bg-muted/30",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-2xl leading-snug" style={{ fontFamily: headingStack }}>
            Guest favourites
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground" style={{ fontFamily: bodyStack }}>
            Fresh pasta, wood-fired pizza, and a short list of natural wines.
          </span>
        </span>
        {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />}
      </span>
      {/* One line, never wrapped: a wrapping caption makes the cards in a row
          different heights, which reads as a layout bug rather than a caption. */}
      <span className="mt-auto flex items-baseline gap-1.5 border-t pt-2 text-[11px]">
        <span className="shrink-0 font-medium">{pairing.name}</span>
        <span className="truncate text-muted-foreground">{pairing.personality}</span>
      </span>
    </button>
  );
}

/** Shows the chosen faces at the sizes they are actually used on a page. */
function TypeSpecimen({ theme }: { theme: ThemeTokens }) {
  const headingName = findFontByStack(theme.headingFont)?.name ?? "Custom";
  const bodyName = findFontByStack(theme.fontFamily)?.name ?? "Custom";

  return (
    <div className="rounded-xl border bg-muted/30 p-5">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {headingName} + {bodyName}
      </p>
      <p className="text-3xl font-bold leading-tight" style={{ fontFamily: theme.headingFont }}>
        Food worth coming back for.
      </p>
      <p className="mt-1.5 text-lg font-semibold" style={{ fontFamily: theme.headingFont }}>
        Guest favourites
      </p>
      <p className="mt-2.5 text-sm leading-6 text-muted-foreground" style={{ fontFamily: theme.fontFamily }}>
        We have been serving the neighbourhood since 2014. Everything on the menu is prepared in house
        each morning, and we are open seven days a week for dine-in, takeout, and delivery.
      </p>
    </div>
  );
}

function RadiusCard({
  option,
  theme,
  selected,
  onSelect,
}: {
  option: (typeof RADIUS_OPTIONS)[number];
  theme: ThemeTokens;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/25 hover:bg-muted/30",
      )}
    >
      {/* A card and a button drawn at this radius, in the merchant's own colours. */}
      <span
        className="flex h-16 items-center justify-center border"
        style={{ background: theme.surfaceMuted, borderColor: theme.border, borderRadius: option.value }}
      >
        <span
          className="px-3 py-1.5 text-[11px] font-semibold"
          style={{ background: theme.brand, color: theme.brandContrast, borderRadius: option.value }}
        >
          Order Online
        </span>
      </span>
      <span>
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{option.label}</span>
          {selected && <Check className="h-3.5 w-3.5 text-primary" />}
        </span>
        <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{option.help}</span>
      </span>
    </button>
  );
}

function colorDrafts(colors: Partial<ThemeColors>): Record<ThemeColorKey, string> {
  return Object.fromEntries(
    THEME_COLOR_KEYS.map((key) => [key, (colors[key] ?? "").toUpperCase()]),
  ) as Record<ThemeColorKey, string>;
}

function sameTheme(a: ThemeTokens, b: ThemeTokens): boolean {
  return (Object.keys(a) as (keyof ThemeTokens)[]).every((key) => a[key] === b[key]);
}
