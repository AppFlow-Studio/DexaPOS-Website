/**
 * The typeface catalogue for built sites.
 *
 * Two things this module is responsible for, and the second is the one that was
 * missing: the theme's default `fontFamily` has always claimed `"DM Sans"`, but
 * nothing ever loaded DM Sans, so every site silently rendered in `system-ui`.
 * A font list is only real if something fetches the files — `googleFontsHref`
 * is that something, and `SiteChrome` calls it with the two families the active
 * theme actually uses (not all of them).
 *
 * Every stack ends in a system fallback so a blocked or slow Google Fonts
 * request degrades to readable text rather than to nothing.
 */

export type FontRole = "heading" | "body";

export type FontCategory = "Sans" | "Serif" | "Display" | "Handwritten" | "System";

export interface SiteFont {
  id: string;
  /** Display name, and the first family in `stack`. */
  name: string;
  /** The complete CSS `font-family` value. This is what is stored in the theme. */
  stack: string;
  /**
   * The `family=` parameter for the Google Fonts CSS2 API, weights included.
   * `null` for stacks made of fonts already on the visitor's device.
   */
  google: string | null;
  category: FontCategory;
  /** Which slots this face is offered for. Display faces read poorly as body copy. */
  roles: FontRole[];
  note: string;
}

const SANS_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';

export const SITE_FONTS: SiteFont[] = [
  // — System —————————————————————————————————————————————
  {
    id: "system-sans",
    name: "System Sans",
    stack: SANS_FALLBACK,
    google: null,
    category: "System",
    roles: ["heading", "body"],
    note: "Loads instantly — uses the visitor's own device font",
  },
  {
    id: "system-serif",
    name: "System Serif",
    stack: SERIF_FALLBACK,
    google: null,
    category: "System",
    roles: ["heading", "body"],
    note: "Loads instantly — classic and familiar",
  },

  // — Sans ———————————————————————————————————————————————
  {
    id: "inter",
    name: "Inter",
    stack: `"Inter", ${SANS_FALLBACK}`,
    google: "Inter:wght@400;500;600;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Neutral and exceptionally readable at small sizes",
  },
  {
    id: "dm-sans",
    name: "DM Sans",
    stack: `"DM Sans", ${SANS_FALLBACK}`,
    google: "DM+Sans:wght@400;500;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Friendly geometric shapes, warm without being cute",
  },
  {
    id: "work-sans",
    name: "Work Sans",
    stack: `"Work Sans", ${SANS_FALLBACK}`,
    google: "Work+Sans:wght@400;500;600;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Sturdy and practical, great for long descriptions",
  },
  {
    id: "poppins",
    name: "Poppins",
    stack: `"Poppins", ${SANS_FALLBACK}`,
    google: "Poppins:wght@400;500;600;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Round and approachable — popular with casual dining",
  },
  {
    id: "outfit",
    name: "Outfit",
    stack: `"Outfit", ${SANS_FALLBACK}`,
    google: "Outfit:wght@400;500;600;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Clean and contemporary with confident headings",
  },
  {
    id: "space-grotesk",
    name: "Space Grotesk",
    stack: `"Space Grotesk", ${SANS_FALLBACK}`,
    google: "Space+Grotesk:wght@400;500;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Slightly technical edge — modern cafes and roasters",
  },
  {
    id: "manrope",
    name: "Manrope",
    stack: `"Manrope", ${SANS_FALLBACK}`,
    google: "Manrope:wght@400;500;600;800",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Tight and confident, strong at large heading sizes",
  },
  {
    id: "karla",
    name: "Karla",
    stack: `"Karla", ${SANS_FALLBACK}`,
    google: "Karla:wght@400;500;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Quirky details that keep plain copy from feeling flat",
  },
  {
    id: "source-sans",
    name: "Source Sans 3",
    stack: `"Source Sans 3", ${SANS_FALLBACK}`,
    google: "Source+Sans+3:wght@400;600;700",
    category: "Sans",
    roles: ["heading", "body"],
    note: "Quiet workhorse — disappears so the content reads",
  },

  // — Serif ——————————————————————————————————————————————
  {
    id: "playfair",
    name: "Playfair Display",
    stack: `"Playfair Display", ${SERIF_FALLBACK}`,
    google: "Playfair+Display:wght@400;600;700",
    category: "Serif",
    roles: ["heading"],
    note: "High-contrast and elegant — the upscale headline face",
  },
  {
    id: "dm-serif",
    name: "DM Serif Display",
    stack: `"DM Serif Display", ${SERIF_FALLBACK}`,
    google: "DM+Serif+Display",
    category: "Serif",
    roles: ["heading"],
    note: "Editorial and magazine-like at large sizes",
  },
  {
    id: "cormorant",
    name: "Cormorant Garamond",
    stack: `"Cormorant Garamond", ${SERIF_FALLBACK}`,
    google: "Cormorant+Garamond:wght@400;600;700",
    category: "Serif",
    roles: ["heading"],
    note: "Delicate and refined — fine dining and tasting menus",
  },
  {
    id: "libre-baskerville",
    name: "Libre Baskerville",
    stack: `"Libre Baskerville", ${SERIF_FALLBACK}`,
    google: "Libre+Baskerville:wght@400;700",
    category: "Serif",
    roles: ["heading", "body"],
    note: "Traditional and established, reads well as body text",
  },
  {
    id: "lora",
    name: "Lora",
    stack: `"Lora", ${SERIF_FALLBACK}`,
    google: "Lora:wght@400;500;600;700",
    category: "Serif",
    roles: ["heading", "body"],
    note: "Warm brushed serif that stays readable in paragraphs",
  },

  // — Display ————————————————————————————————————————————
  {
    id: "bebas",
    name: "Bebas Neue",
    stack: `"Bebas Neue", "Arial Narrow", ${SANS_FALLBACK}`,
    google: "Bebas+Neue",
    category: "Display",
    roles: ["heading"],
    note: "Tall condensed capitals — burgers, BBQ, sports bars",
  },
  {
    id: "oswald",
    name: "Oswald",
    stack: `"Oswald", "Arial Narrow", ${SANS_FALLBACK}`,
    google: "Oswald:wght@400;500;600;700",
    category: "Display",
    roles: ["heading"],
    note: "Condensed and punchy, fits long names on one line",
  },
  {
    id: "anton",
    name: "Anton",
    stack: `"Anton", "Arial Black", ${SANS_FALLBACK}`,
    google: "Anton",
    category: "Display",
    roles: ["heading"],
    note: "Maximum impact — headline-only, never body copy",
  },

  // — Handwritten ————————————————————————————————————————
  {
    id: "pacifico",
    name: "Pacifico",
    stack: `"Pacifico", ${SANS_FALLBACK}`,
    google: "Pacifico",
    category: "Handwritten",
    roles: ["heading"],
    note: "Hand-lettered feel for bakeries, ice cream, and diners",
  },
];

export interface FontPairing {
  id: string;
  name: string;
  /** The kind of restaurant this pairing was chosen for. */
  personality: string;
  headingId: string;
  bodyId: string;
}

/**
 * Pre-matched heading/body combinations.
 *
 * The primary path in the workspace: pairing two typefaces well is the part a
 * restaurant owner has no reason to know how to do, so the default interaction
 * is picking a finished pair, and choosing each face separately is the
 * disclosure underneath.
 */
export const FONT_PAIRINGS: FontPairing[] = [
  { id: "modern-bistro", name: "Modern Bistro", personality: "Elegant headline, clean body", headingId: "playfair", bodyId: "dm-sans" },
  { id: "fine-dining", name: "Fine Dining", personality: "Refined and understated", headingId: "cormorant", bodyId: "lora" },
  { id: "neighbourhood-cafe", name: "Neighbourhood Cafe", personality: "Bright and contemporary", headingId: "outfit", bodyId: "work-sans" },
  { id: "bold-casual", name: "Bold & Casual", personality: "Loud headlines, easy reading", headingId: "bebas", bodyId: "inter" },
  { id: "street-food", name: "Street Food", personality: "Heavyweight and direct", headingId: "anton", bodyId: "manrope" },
  { id: "artisan-bakery", name: "Artisan Bakery", personality: "Hand-lettered and homemade", headingId: "pacifico", bodyId: "karla" },
  { id: "editorial", name: "Editorial", personality: "Magazine-style contrast", headingId: "dm-serif", bodyId: "source-sans" },
  { id: "contemporary", name: "Contemporary", personality: "Sharp and design-led", headingId: "space-grotesk", bodyId: "inter" },
  { id: "warm-friendly", name: "Warm & Friendly", personality: "Round, soft, approachable", headingId: "poppins", bodyId: "poppins" },
  { id: "timeless", name: "Timeless", personality: "Traditional and dependable", headingId: "libre-baskerville", bodyId: "source-sans" },
  { id: "market-hall", name: "Market Hall", personality: "Condensed signage feel", headingId: "oswald", bodyId: "dm-sans" },
  { id: "system-default", name: "System Default", personality: "Fastest possible page load", headingId: "system-sans", bodyId: "system-sans" },
];

export function findFont(id: string): SiteFont | undefined {
  return SITE_FONTS.find((font) => font.id === id);
}

/** The catalogue entry whose `stack` is stored in a theme, if it is still offered. */
export function findFontByStack(stack: string | undefined): SiteFont | undefined {
  if (!stack) return undefined;
  const normalized = stack.replace(/\s+/g, " ").trim();
  return SITE_FONTS.find((font) => font.stack.replace(/\s+/g, " ").trim() === normalized);
}

export function fontsForRole(role: FontRole): SiteFont[] {
  return SITE_FONTS.filter((font) => font.roles.includes(role));
}

/** The stack for a font id, falling back to the system sans stack. */
export function stackFor(id: string): string {
  return findFont(id)?.stack ?? SANS_FALLBACK;
}

/**
 * A Google Fonts CSS2 URL covering exactly the given stacks, or `null` if none
 * of them need loading.
 *
 * Deduplicated and sorted so the same theme always produces the same URL — a
 * stable href is cacheable and keeps React from swapping the stylesheet on
 * re-render.
 */
export function googleFontsHref(stacks: (string | undefined | null)[]): string | null {
  const families = [
    ...new Set(
      stacks.flatMap((stack) => {
        const google = findFontByStack(stack ?? undefined)?.google;
        return google ? [google] : [];
      }),
    ),
  ].sort();

  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}

/**
 * Every loadable family in the catalogue.
 *
 * Only for the design workspace, where each face is rendered as a live specimen
 * and there is nothing to preview if the fonts are not present. Public pages use
 * `googleFontsHref` with the two families in the active theme.
 */
let catalogHref: string | null = null;

export function catalogFontsHref(): string {
  // Memoised: this is called on every render of the design workspace, and a
  // newly-built string each time would make React treat it as a new stylesheet.
  if (catalogHref) return catalogHref;
  const families = SITE_FONTS.flatMap((font) => (font.google ? [font.google] : [])).sort();
  catalogHref = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
  return catalogHref;
}
