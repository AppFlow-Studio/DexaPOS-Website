import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import type { SectionKind } from "@/lib/site-builder/sections/kinds";

import ContentSection from "./sections/ContentSection";
import FaqSection from "./sections/FaqSection";
import FeaturesSection from "./sections/FeaturesSection";
import FooterSection from "./sections/FooterSection";
import GallerySection from "./sections/GallerySection";
import HeaderSection from "./sections/HeaderSection";
import HeroSection from "./sections/HeroSection";
import LocationSection from "./sections/LocationSection";
import PopularItemsSection from "./sections/PopularItemsSection";

/**
 * Binds section kinds to their renderers.
 *
 * Kept separate from `SECTION_REGISTRY` so the contract in `lib/site-builder`
 * stays React-free and importable by pure logic, tests, scripts, and — later —
 * an AI generator or an import tool. This is the one place the two halves meet.
 *
 * The mapped type makes a missing renderer a **compile error**, so adding a
 * section kind cannot silently ship without one.
 */
export const SECTION_RENDERERS: {
  [K in SectionKind]: (props: SectionRenderProps<K>) => React.ReactNode;
} = {
  header: HeaderSection,
  hero: HeroSection,
  content: ContentSection,
  gallery: GallerySection,
  "popular-items": PopularItemsSection,
  features: FeaturesSection,
  faq: FaqSection,
  location: LocationSection,
  footer: FooterSection,
};

export function getSectionRenderer(kind: string) {
  return (SECTION_RENDERERS as Record<string, unknown>)[kind] as
    | ((props: SectionRenderProps) => React.ReactNode)
    | undefined;
}
