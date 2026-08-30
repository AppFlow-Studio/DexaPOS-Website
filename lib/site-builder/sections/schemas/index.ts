/**
 * Every section's schema, props type, and defaults factory, in one place.
 *
 * `SectionPropsMap` is the bridge between the runtime schemas and the
 * compile-time `Section` discriminated union in `../types.ts`. Adding a kind
 * means adding a schema file, a line to `SECTION_KINDS`, a line here, and a
 * registry entry — and the mapped types make a missing one a compile error
 * rather than a runtime surprise.
 */

import type { SectionKind } from "../kinds";

export * from "./header";
export * from "./hero";
export * from "./content";
export * from "./cards";
export * from "./gallery";
export * from "./reviews";
export * from "./reservations";
export * from "./scrolling-banner";
export * from "./video";
export * from "./pdf";
export * from "./form";
export * from "./events";
export * from "./integrations";
export * from "./popular-items";
export * from "./features";
export * from "./faq";
export * from "./location";
export * from "./footer";

import type { HeaderProps } from "./header";
import type { HeroProps } from "./hero";
import type { ContentProps } from "./content";
import type { CardsProps } from "./cards";
import type { GalleryProps } from "./gallery";
import type { ReviewsProps } from "./reviews";
import type { ReservationsSectionProps } from "./reservations";
import type { ScrollingBannerProps } from "./scrolling-banner";
import type { VideoProps } from "./video";
import type { PdfProps } from "./pdf";
import type { FormSectionProps } from "./form";
import type { EventsProps } from "./events";
import type { IntegrationsProps } from "./integrations";
import type { PopularItemsProps } from "./popular-items";
import type { FeaturesProps } from "./features";
import type { FaqProps } from "./faq";
import type { LocationProps } from "./location";
import type { FooterProps } from "./footer";

export interface SectionPropsMap {
  header: HeaderProps;
  hero: HeroProps;
  content: ContentProps;
  cards: CardsProps;
  gallery: GalleryProps;
  reviews: ReviewsProps;
  reservations: ReservationsSectionProps;
  "scrolling-banner": ScrollingBannerProps;
  video: VideoProps;
  pdf: PdfProps;
  form: FormSectionProps;
  events: EventsProps;
  integrations: IntegrationsProps;
  "popular-items": PopularItemsProps;
  features: FeaturesProps;
  faq: FaqProps;
  location: LocationProps;
  footer: FooterProps;
}

export type PropsOf<K extends SectionKind> = SectionPropsMap[K];
