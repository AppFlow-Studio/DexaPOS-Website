/**
 * The palette catalogue offered in the site design workspace.
 *
 * A palette declares only the three colours a restaurant owner has an opinion
 * about — brand, page background, text — and lets `deriveThemeColors` fill in
 * the muted panels, borders, footer band, and secondary copy. Hand-writing all
 * ten per palette is how the previous four-preset list ended up shipping a dark
 * "Midnight" theme that still carried light-grey borders: the four colours it
 * set looked right, and the six it did not set were left at their light-mode
 * defaults. Deriving them makes that class of bug unrepresentable.
 *
 * `overrides` exists for the cases where derivation is merely *safe* and a
 * hand-picked value is better.
 */

import { deriveThemeColors, type ThemeColors } from "./color";

export type PaletteMood = "fresh" | "warm" | "bold";

export interface SitePalette {
  id: string;
  name: string;
  mood: PaletteMood;
  /** One concrete sentence about the room this palette belongs in. */
  description: string;
  core: { brand: string; surface: string; text: string };
  overrides?: Partial<ThemeColors>;
}

export const PALETTE_MOODS: { id: PaletteMood; label: string; hint: string }[] = [
  { id: "fresh", label: "Fresh & clean", hint: "Crisp, modern, lots of white space" },
  { id: "warm", label: "Warm & inviting", hint: "Earthy and appetising" },
  { id: "bold", label: "Bold & dark", hint: "Dramatic evening atmosphere" },
];

export const SITE_PALETTES: SitePalette[] = [
  {
    id: "dexa-blue",
    name: "Dexa Blue",
    mood: "fresh",
    description: "The DexaPOS default. Trustworthy and easy to read.",
    core: { brand: "#0C4FD1", surface: "#FFFFFF", text: "#111827" },
  },
  {
    id: "slate-minimal",
    name: "Slate Minimal",
    mood: "fresh",
    description: "Near-monochrome. Lets your food photography carry the page.",
    core: { brand: "#1F2937", surface: "#FFFFFF", text: "#18181B" },
  },
  {
    id: "coastal-teal",
    name: "Coastal Teal",
    mood: "fresh",
    description: "Seafood, poke, and juice bars. Cool and appetising.",
    core: { brand: "#0F766E", surface: "#F7FDFC", text: "#10221F" },
  },
  {
    id: "garden-sage",
    name: "Garden Sage",
    mood: "fresh",
    description: "Farm-to-table, salads, and plant-forward menus.",
    core: { brand: "#4D7C0F", surface: "#FAFAF5", text: "#1F271A" },
  },
  {
    id: "bistro-red",
    name: "Bistro Red",
    mood: "warm",
    description: "Classic neighbourhood trattoria and pizzeria energy.",
    core: { brand: "#B42318", surface: "#FFFBF7", text: "#241C18" },
  },
  {
    id: "terracotta",
    name: "Terracotta",
    mood: "warm",
    description: "Taquerias, grills, and anything cooked over fire.",
    core: { brand: "#C2410C", surface: "#FFF8F3", text: "#2C1A11" },
  },
  {
    id: "honey-oak",
    name: "Honey Oak",
    mood: "warm",
    description: "Bakeries and brunch rooms. Soft, unhurried, welcoming.",
    core: { brand: "#A16207", surface: "#FDFBF6", text: "#292014" },
  },
  {
    id: "sunbeam",
    name: "Sunbeam",
    mood: "warm",
    description: "High-energy quick service. Impossible to scroll past.",
    core: { brand: "#F59E0B", surface: "#FFFCF2", text: "#251C08" },
  },
  {
    id: "berry-plum",
    name: "Berry Plum",
    mood: "warm",
    description: "Dessert bars, patisserie, and cocktail-forward menus.",
    core: { brand: "#9D174D", surface: "#FFF7FA", text: "#2A1220" },
  },
  {
    id: "espresso",
    name: "Espresso",
    mood: "bold",
    description: "Dark roast browns with a warm gold accent. Coffee houses.",
    core: { brand: "#D9A441", surface: "#17110E", text: "#F5EDE4" },
  },
  {
    id: "midnight-gold",
    name: "Midnight Gold",
    mood: "bold",
    description: "Steakhouse and fine dining after dark.",
    core: { brand: "#C9A227", surface: "#0F1115", text: "#F4F5F7" },
  },
  {
    id: "charcoal-lime",
    name: "Charcoal & Lime",
    mood: "bold",
    description: "Street food and late-night counters. Loud on purpose.",
    core: { brand: "#A3E635", surface: "#111312", text: "#F2F5F1" },
  },
  {
    id: "forest-night",
    name: "Forest Night",
    mood: "bold",
    description: "Cocktail bars and chef's tables. Deep green, mint accent.",
    core: { brand: "#34D399", surface: "#0C1512", text: "#ECFDF5" },
  },
  {
    id: "noir-rose",
    name: "Noir Rose",
    mood: "bold",
    description: "Wine bars and small plates. Dark with a soft blush accent.",
    core: { brand: "#FB7185", surface: "#14100F", text: "#FAF0F0" },
  },
];

/** The full ten-colour token set for a palette. */
export function paletteColors(palette: SitePalette): ThemeColors {
  return { ...deriveThemeColors(palette.core), ...palette.overrides };
}

/** The palette whose colours match `colors` exactly, if any. */
export function matchPalette(colors: Partial<ThemeColors>): SitePalette | null {
  return (
    SITE_PALETTES.find((palette) => {
      const resolved = paletteColors(palette);
      return (Object.keys(resolved) as (keyof ThemeColors)[]).every(
        (key) => colors[key]?.toUpperCase() === resolved[key].toUpperCase(),
      );
    }) ?? null
  );
}

export function findPalette(id: string): SitePalette | undefined {
  return SITE_PALETTES.find((palette) => palette.id === id);
}
