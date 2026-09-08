/**
 * The section registry — the single source of truth every other part of the
 * feature is derived from.
 *
 * One entry per kind drives: the Add Section modal, editor form generation,
 * save-time validation, read-time repair, renderer dispatch, binding
 * collection, and reorder legality. Adding section kind #10 means adding one
 * schema file and one entry here — no switch statement to hunt down, no
 * validator to extend, no modal to update.
 *
 * Deliberately React-free and I/O-free so it can be imported by pure logic,
 * by tests, and (later) by an AI generator or an import tool. Renderers are
 * bound to kinds separately in `components/site-builder/registry.tsx` at
 * Stage 4; `icon` is a lucide *name*, not a component, for the same reason.
 */

import type { z } from "zod";

import type { BindingType } from "../bindings/types";
import type { FieldControl } from "../schema-introspect";
import { FEATURE_LABELS, type SiteFeature, type SiteFeatures } from "../site-settings";
import type { SectionCategory, SectionKind, Zone } from "./kinds";
import { SECTION_CATEGORIES, SECTION_KINDS } from "./kinds";
import type { IntegrationProvider } from "./schemas/integrations";
import type { PropsOf } from "./schemas";
import {
  cardsDefaults,
  cardsSchema,
  contentDefaults,
  contentSchema,
  pdfDefaults,
  pdfSchema,
  formDefaults,
  formSchema,
  eventsDefaults,
  eventsSchema,
  integrationsDefaults,
  integrationsSchema,
  PROVIDER_SPECS,
  reviewsDefaults,
  reviewsSchema,
  reservationsDefaults,
  reservationsSchema,
  scrollingBannerDefaults,
  scrollingBannerSchema,
  videoDefaults,
  videoSchema,
  faqDefaults,
  faqSchema,
  featuresDefaults,
  featuresSchema,
  footerDefaults,
  footerSchema,
  galleryDefaults,
  gallerySchema,
  headerDefaults,
  headerSchema,
  heroDefaults,
  heroSchema,
  locationDefaults,
  locationSchema,
  popularItemsDefaults,
  popularItemsSchema,
} from "./schemas";

/**
 * A shared `SectionStyle` field a kind's drawer may expose.
 *
 * Deliberately a small closed set rather than "any key of SectionStyle":
 * `hideOn` and `spacing` have no UI, so listing them would advertise controls
 * that do not exist.
 *
 * `align` was in that category until the highlights strip needed it. Twelve
 * renderers already read `section.style?.align` and nothing in the builder had
 * ever written it, so every one of them was pinned to its default — the field
 * was live in the renderer and dead in the product. Any kind that wants the
 * control now adds one word to its `styleControls`.
 */
export type StyleControl = "background" | "textTone" | "align";

/** Context a defaults factory may need. Some kinds bind to the site's location. */
export interface SectionDefaultsContext {
  locationId?: string;
}

export interface SectionDefinition<K extends SectionKind> {
  kind: K;
  /** Shown in the Add Section modal and the layers panel. */
  label: string;
  description: string;
  /** lucide-react icon name, resolved by the UI against an allowlist. */
  icon: string;
  zone: Zone;
  /** Grouping in the Add Section modal. Presentational only. */
  category: SectionCategory;
  /**
   * Which prop carries the merchant's own title for this section.
   *
   * The layers panel labels rows with it, falling back to `label` when it is
   * absent or empty — "Guest Favorites" reads better than a list of nine
   * identical nouns. Declared here rather than guessed by the UI so that adding
   * a kind whose title lives under a different key stays a one-line change.
   */
  titleField?: string;
  /** At most one per page. */
  singleton: boolean;
  /** Merchant may add it from the Add Section modal. */
  addable: boolean;
  /**
   * Why this kind cannot do its job yet, or `undefined` when it is ready.
   *
   * Distinct from `addable: false`, which means "this kind is placed by the
   * system and merchants never insert it". This means "this kind is genuinely
   * for merchants, and adding one today would produce a section that cannot do
   * what its own description promises". The gallery is the case that prompted
   * it: it is offered as "a grid or carousel of photos" while `resolveAssetUrl`
   * returns `null` for every id, so a merchant could add one, find no way to put
   * a photo in it, and reasonably conclude the product is broken.
   *
   * Lives on the registry rather than in the modal so the reason travels with
   * the kind — the same invariant that keeps the add gallery derived rather
   * than listed. Delete the field from an entry to turn the kind on.
   */
  unavailable?: string;
  /**
   * The brand toggle this kind depends on, if any.
   *
   * The third and last axis of "can this be offered", and the one that varies
   * per merchant rather than per build:
   *
   *  - `addable: false` — the system places it; merchants never insert one.
   *  - `unavailable` — no merchant can use it yet, because the product cannot
   *    yet keep the promise the description makes.
   *  - `requiresFeature` — **this** merchant has not turned the capability on.
   *
   * Enforced by absence: a kind whose feature is off does not appear in the Add
   * Section catalogue at all, and one line beneath the grid names the toggle
   * that would bring it back. A disabled row would teach a merchant that the
   * product is full of things they may not have; an absent one, plus a sentence
   * saying where the switch is, teaches them where the switch is.
   *
   * **Turning a feature off never removes sections already on a page.** A
   * toggle that silently deleted published content would be a terrible thing to
   * discover, and the merchant may be turning it off precisely to stop offering
   * something new while they sort the existing page out. It removes the kind
   * from the catalogue and nothing else.
   */
  requiresFeature?: SiteFeature;
  /**
   * What a merchant may do with a placed instance of this kind.
   *
   * Orthogonal to `addable` / `unavailable`, which answer *whether the kind can
   * be offered at all*. These answer *what can be done with one that is already
   * on the page*, and they are the mechanism that keeps every site structurally
   * sound while still feeling editable — read off a live Owner.com account and
   * documented in docs/research/owner-com-website-tab/features/05-page-editor.md §5.
   *
   * The pattern behind the values, which is what makes them predictable:
   *
   *  - **not editable** ⇒ the content belongs to another system (the menu, the
   *    location record, another screen). There is nothing here to type into.
   *  - **not deletable** ⇒ the section is structurally required. Every page has
   *    a header and a footer.
   *  - **not movable** ⇒ its position is part of the layout contract. A header
   *    is first, a footer is last, and neither is a matter of taste.
   *
   * **Enforced by omitting the control, never by disabling it.** A greyed-out
   * button teaches a merchant that the product is full of things they are not
   * allowed to do; an absent one simply never raises the question. The gutters
   * read these flags, and `mutations.ts` refuses what the gutters do not offer —
   * the UI provides the affordance, the mutation layer provides the invariant.
   */
  editable: boolean;
  deletable: boolean;
  movable: boolean;
  /**
   * Which of the shared `SectionStyle` controls this kind's drawer offers.
   *
   * `style` is a contract every section shares, but not every field of it makes
   * sense on every kind — and the drawer used to say so with
   * `section.kind === "reviews"` written into the panel, which is precisely the
   * parallel list the registry exists to abolish. A kind that wants a control
   * now says so here, once.
   *
   * - **`background`** — the four-tone band behind the section.
   * - **`textTone`** — the colour of its copy, resolved against whatever backdrop
   *   it ends up on. Offered by every kind that renders merchant-authored copy,
   *   which is all of them except the header: that one is navigation chrome, and
   *   its own appearance settings are already its editor's subject.
   * - **`align`** — whether the section's heading sits left or centred. Only the
   *   kinds whose layout can honour both should offer it.
   *
   * Omit the field for a kind that offers none of them.
   */
  styleControls?: readonly StyleControl[];
  /**
   * Fields that make no sense given what the merchant has already chosen.
   *
   * Owner's Content panel shows a photo picker only once Background is set to
   * Photo, and an Alignment control only once there is media to align — so a
   * panel of nine possible fields is never more than six at a time. The
   * generated drawer cannot infer that from a Zod schema, because "irrelevant
   * right now" is not a validation rule; it is the one thing about a section's
   * form that has to be stated.
   *
   * Deliberately *hidden*, not disabled — the same principle as the gutter
   * controls. A greyed-out picker asks the merchant to work out why.
   *
   * Returns field names to omit. Omit the whole function for a kind whose
   * fields are all always relevant.
   */
  hiddenFields?: (props: Record<string, unknown>) => string[];
  /**
   * Per-field refinements the schema cannot express, keyed by field name.
   *
   * `describeSchema` derives a control from a field in isolation, which is what
   * keeps it honest — but a few controls are only correctly labelled in the
   * light of a *sibling* prop. The integrations embed field is the case: its
   * label, help text and example are facts about the chosen provider, not about
   * the field, and its provider selector has to declare what it invalidates.
   *
   * Kept to a merge over the derived control rather than a free-form panel
   * hook, so a kind can still only adjust what the schema already produced.
   */
  fieldOverrides?: (
    props: Record<string, unknown>,
  ) => Record<string, Partial<FieldControl>>;
  /** Runtime validation. `.shape` is used by `normalize` for field-level repair. */
  schema: z.ZodObject<any>;
  defaults: (ctx?: SectionDefaultsContext) => PropsOf<K>;
  /** Which platform records this kind references. Drives PLAN-03's collector. */
  bindingTypes: readonly BindingType[];
  /**
   * Fields resolved live at render rather than stored (decision D6). Purely
   * descriptive — it drives merchant-facing copy such as "prices update
   * automatically" and the rollback warning. Enforcement is structural: these
   * fields have nowhere to live in the schema.
   */
  liveFields: readonly string[];
  /**
   * Whether rendering this kind needs the site's events on the render context.
   *
   * Events do not travel through the binding resolver — they arrive as a whole
   * list, fetched once per page, and only for pages that actually want them
   * (it is a query nearly every page would waste). Both render paths therefore
   * have to ask "does this document contain an event-backed section", and both
   * used to answer it with a hard-coded `kind === "events"`.
   *
   * That is a trap rather than a shortcut: a kind the literal did not name
   * renders against an empty list — no error, no warning, just a section that
   * is silently blank on a merchant's live homepage. Declaring the dependency
   * here means the next event-backed kind inherits the fetch by existing, and
   * `pageNeedsEvents` is the only thing that reads it.
   */
  usesEvents?: boolean;
}

export const SECTION_REGISTRY: { [K in SectionKind]: SectionDefinition<K> } = {
  header: {
    kind: "header",
    label: "Header",
    description: "Logo, navigation and order button.",
    icon: "PanelTop",
    zone: "masthead",
    category: "frame",
    singleton: true,
    addable: false,
    // Owner's header carries an edit control and nothing else, and so does
    // ours: the nav editor opens from it.
    editable: true,
    deletable: false,
    // The fix for a real defect. `moveSection` only ever refused *cross-zone*
    // moves, and the header and hero share the masthead zone — so a merchant
    // could put their hero above their own navigation and publish it.
    movable: false,
    schema: headerSchema,
    defaults: () => headerDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  hero: {
    kind: "hero",
    label: "Hero",
    description: "Large opening banner with a headline and a call to action.",
    icon: "Image",
    zone: "masthead",
    category: "frame",
    titleField: "heading",
    singleton: true,
    addable: false,
    editable: true,
    deletable: false,
    movable: false,
    // `bistro` sets the copy *beside* the photo rather than on top of it, so it
    // renders no scrim and never reads `overlayOpacity`. Leaving the slider on
    // screen let a merchant drag it and watch nothing happen.
    hiddenFields: (props) => (props.variant === "bistro" ? ["overlayOpacity"] : []),
    styleControls: ["textTone"],
    schema: heroSchema,
    defaults: () => heroDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  content: {
    kind: "content",
    label: "Content",
    description: "Rich text with an optional image — your story, an announcement.",
    icon: "Text",
    zone: "body",
    category: "story",
    titleField: "heading",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    hiddenFields: (props) => {
      const hidden: string[] = [];
      if (props.background !== "color") hidden.push("backgroundTone");
      if (props.background !== "photo") hidden.push("backgroundImage");
      if (props.media !== "photo") hidden.push("mediaImage", "alignment");
      return hidden;
    },
    styleControls: ["textTone"],
    schema: contentSchema,
    defaults: () => contentDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  cards: {
    kind: "cards",
    label: "Cards",
    description: "A row of offers or services, each with its own photo and button.",
    icon: "LayoutGrid",
    zone: "body",
    category: "story",
    titleField: "title",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: cardsSchema,
    defaults: () => cardsDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  reservations: {
    kind: "reservations",
    label: "Reservations",
    description: "Let guests book a table, on your own site.",
    icon: "CalendarCheck",
    zone: "body",
    category: "visit",
    titleField: "title",
    // Not a singleton: a long page can reasonably offer booking near the top
    // and again at the bottom. They read the same live availability, so there
    // is no state to diverge.
    singleton: false,
    addable: true,
    // Gated on the merchant turning Reservations on. `resolveReservationMode`
    // decides whether that means linking out or booking here; this gate only
    // asks whether the capability exists at all.
    requiresFeature: "reservations",
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["background", "textTone"],
    schema: reservationsSchema,
    defaults: () => reservationsDefaults(),
    // Availability is fetched live by the widget, not resolved through the
    // binding system: a binding is snapshotted at publish, and a snapshotted
    // table grid is a grid that sells tables somebody already took.
    bindingTypes: [],
    liveFields: [],
  },

  reviews: {
    kind: "reviews",
    label: "Reviews",
    description: "Quotes from guests, in their own words.",
    icon: "Star",
    zone: "body",
    category: "story",
    titleField: "title",
    singleton: false,
    addable: true,
    requiresFeature: "reviews",
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["background", "textTone"],
    schema: reviewsSchema,
    defaults: () => reviewsDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  "scrolling-banner": {
    kind: "scrolling-banner",
    label: "Scrolling Banner",
    description: "A moving strip of short messages.",
    icon: "Megaphone",
    zone: "body",
    category: "extras",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: scrollingBannerSchema,
    defaults: () => scrollingBannerDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  video: {
    kind: "video",
    label: "Video",
    description: "One video from YouTube or Vimeo.",
    icon: "Play",
    zone: "body",
    category: "media",
    titleField: "title",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: videoSchema,
    defaults: () => videoDefaults(),
    bindingTypes: [],
    liveFields: [],
    // The pasted link determines the provider and id together. Exposing a
    // second provider selector would let those two stored values drift apart.
    hiddenFields: () => ["provider"],
  },

  /**
   * Retired from the catalogue, not deleted.
   *
   * `addable: false` here does not mean "the system places it" the way it does
   * for header, hero and footer — it means merchants no longer insert one. The
   * entry stays because a page that already carries a PDF section has to keep
   * rendering it, and its owner has to keep being able to edit or remove it: a
   * kind the registry has forgotten is a section that cannot be deleted.
   *
   * It was previously offered and permanently greyed out with an `unavailable`
   * reason, which meant every merchant met a row for something none of them
   * could ever have. Absent says the same thing and costs no reading.
   */
  pdf: {
    kind: "pdf",
    label: "PDF",
    description: "A document guests can open — a printed menu or a catering pack.",
    icon: "FileText",
    zone: "body",
    category: "extras",
    titleField: "title",
    singleton: false,
    addable: false,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: pdfSchema,
    defaults: () => pdfDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  form: {
    kind: "form",
    label: "Form",
    description: "One of your forms — contact, catering, private events.",
    icon: "ClipboardList",
    zone: "body",
    category: "extras",
    titleField: "title",
    // Deliberately NOT a singleton. A long page can reasonably carry an enquiry
    // form near the top and again at the bottom, and they can be the same form:
    // one definition, one inbox, two placements.
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: formSchema,
    defaults: () => formDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  events: {
    kind: "events",
    label: "Events",
    description: "Your events — all of them as a grid, or one on its own.",
    icon: "CalendarDays",
    zone: "body",
    category: "extras",
    titleField: "title",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: eventsSchema,
    defaults: () => eventsDefaults(),
    bindingTypes: [],
    /**
     * Empty, even though nothing on this section is stored.
     *
     * `liveFields` names fields the *binding resolver* fills in, and it is
     * paired with `bindingTypes` — a registry test enforces that a kind
     * claiming live fields also declares what it binds to. Events do not go
     * through the resolver at all: they arrive on the render context as a list,
     * because this section references no particular event. Claiming a live
     * field here would describe a mechanism that is not the one in use.
     *
     * The "updates itself" promise is in the description instead, where it is
     * merchant-facing and where it belongs.
     */
    liveFields: [],
    usesEvents: true,
    /**
     * Half of this panel belongs to a layout the merchant is not using.
     *
     * `grid` has a count and nothing else to say; `spotlight` has a photograph
     * to place and no count, because it shows exactly one. Showing both sets at
     * once would put five controls on screen that visibly do nothing — the
     * defect this hook exists to prevent (see the hero's `overlayOpacity`
     * directly above).
     *
     * Within `spotlight` the same rule applies once more: a size makes no sense
     * for a photograph that fills the band, and a scrim makes no sense for one
     * that no text sits on.
     */
    hiddenFields: (props) => {
      if (props.layout !== "spotlight") {
        return ["eventId", "photoPosition", "photoSize", "textSize", "overlayOpacity"];
      }
      return ["limit", props.photoPosition === "behind" ? "photoSize" : "overlayOpacity"];
    },
  },

  integrations: {
    kind: "integrations",
    label: "Integrations",
    description: "A trusted third-party embed — a Google map, a Spotify player, an Untappd beer menu.",
    icon: "Plug",
    zone: "body",
    category: "extras",
    titleField: "title",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    /*
      The paste field is a different field depending on the provider — "Untappd
      iframe URL or IDs" is only right while Untappd is selected — and switching
      provider strands the old link, which the schema then refuses. Both are
      sibling-dependent, so both live here rather than in the drawer.
    */
    fieldOverrides: (props) => {
      const spec =
        PROVIDER_SPECS[props.provider as IntegrationProvider] ?? PROVIDER_SPECS["google-maps"];
      return {
        provider: { clears: ["embedUrl"] },
        embedUrl: {
          label: spec.inputLabel,
          help: spec.help,
          placeholder: spec.placeholder,
        },
      };
    },
    styleControls: ["textTone"],
    schema: integrationsSchema,
    defaults: () => integrationsDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  gallery: {
    kind: "gallery",
    label: "Gallery",
    description: "A grid or carousel of photos.",
    icon: "Images",
    zone: "body",
    category: "media",
    titleField: "heading",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: gallerySchema,
    defaults: () => galleryDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  "popular-items": {
    kind: "popular-items",
    label: "Popular Items",
    description: "Showcase menu items. Prices and availability stay up to date automatically.",
    icon: "UtensilsCrossed",
    zone: "body",
    category: "menu",
    titleField: "heading",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: popularItemsSchema,
    defaults: () => popularItemsDefaults(),
    bindingTypes: ["menu_item"],
    liveFields: ["name", "description", "price", "image", "availability", "snooze"],
  },

  features: {
    kind: "features",
    label: "Highlights",
    description: "Short selling points with icons.",
    icon: "Sparkles",
    zone: "body",
    category: "story",
    titleField: "heading",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone", "align"],
    schema: featuresSchema,
    defaults: () => featuresDefaults(),
    bindingTypes: [],
    liveFields: [],
    /**
     * The generated controls stop at the heading.
     *
     * `items` is a reorderable list whose rows open an editor of their own, and
     * the icon colour is a tone-plus-picker pair — neither is a shape the
     * schema-derived drawer can express, so both are drawn by `FeaturesEditor`
     * the way the navigation is drawn by `NavEditor`.
     */
    hiddenFields: () => ["items", "iconTone", "iconColor"],
    /*
      "Title", not the "Heading" the field name humanizes to. Every other field
      in this panel belongs to one feature and is labelled Title there, so the
      section's own field has to use the same word or the merchant is reading
      two names for the same idea one scroll apart.
    */
    fieldOverrides: () => ({ heading: { label: "Title" } }),
  },

  faq: {
    kind: "faq",
    label: "FAQ",
    description: "Questions and answers in an accordion.",
    icon: "MessageCircleQuestion",
    zone: "body",
    category: "story",
    titleField: "heading",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: faqSchema,
    defaults: () => faqDefaults(),
    bindingTypes: [],
    liveFields: [],
  },

  location: {
    kind: "location",
    label: "Location & Hours",
    description: "Address, hours and map. Always shows your current details.",
    icon: "MapPin",
    zone: "body",
    category: "visit",
    titleField: "heading",
    singleton: false,
    addable: true,
    editable: true,
    deletable: true,
    movable: true,
    styleControls: ["textTone"],
    schema: locationSchema,
    defaults: (ctx) => locationDefaults(ctx?.locationId),
    bindingTypes: ["location", "hours"],
    liveFields: ["address", "phone", "coordinates", "hours"],
  },

  footer: {
    kind: "footer",
    label: "Footer",
    description: "Address, hours, links and social accounts.",
    icon: "PanelBottom",
    zone: "colophon",
    category: "frame",
    singleton: true,
    addable: false,
    /**
     * Owner's footer is fully locked — no edit control at all — because every
     * word in it comes from brand settings.
     *
     * Ours stays editable because that source does not exist yet: the tagline,
     * links and copyright line in `footerSchema` have no other home, so locking
     * it today would strand them with no way to set them. This flips to `false`
     * when brand settings own that copy.
     */
    editable: true,
    deletable: false,
    movable: false,
    styleControls: ["textTone"],
    schema: footerSchema,
    defaults: (ctx) => footerDefaults(ctx?.locationId),
    bindingTypes: ["location", "hours"],
    liveFields: ["address", "phone", "hours"],
  },
};

/** Returns the definition, or `undefined` for a kind this build does not know. */
export function getSectionDefinition(
  kind: string,
): SectionDefinition<SectionKind> | undefined {
  return (SECTION_REGISTRY as Record<string, SectionDefinition<SectionKind>>)[kind];
}

/**
 * Kinds a merchant may insert, in Add Section modal order.
 *
 * Feature-blind: this is "which kinds does this *build* let merchants add",
 * and it is what the registry's own invariant tests and the section catalogue
 * documentation are about. What a *particular* merchant may add is
 * `availableKinds`, which takes their toggles.
 */
export function addableKinds(): SectionKind[] {
  return SECTION_KINDS.filter((k) => SECTION_REGISTRY[k].addable);
}

/** Whether this merchant's toggles permit this kind. Kinds with no toggle always pass. */
export function isKindAvailable(kind: SectionKind, features: SiteFeatures): boolean {
  const required = SECTION_REGISTRY[kind].requiresFeature;
  return !required || features[required];
}

/** Addable kinds this merchant's brand settings actually allow. */
export function availableKinds(features: SiteFeatures): SectionKind[] {
  return addableKinds().filter((kind) => isKindAvailable(kind, features));
}

/**
 * The kinds held back by a toggle, and the sentence that says so.
 *
 * One line per *feature* rather than per kind — "Reviews sections appear once
 * Customer reviews is on" reads as guidance; four near-identical lines read as
 * a list of things the merchant cannot have.
 */
export function kindsAwaitingFeature(
  features: SiteFeatures,
): { feature: SiteFeature; featureLabel: string; kinds: SectionKind[] }[] {
  const grouped = new Map<SiteFeature, SectionKind[]>();

  for (const kind of addableKinds()) {
    const required = SECTION_REGISTRY[kind].requiresFeature;
    if (!required || features[required]) continue;
    grouped.set(required, [...(grouped.get(required) ?? []), kind]);
  }

  return [...grouped.entries()].map(([feature, kinds]) => ({
    feature,
    featureLabel: FEATURE_LABELS[feature],
    kinds,
  }));
}

export function zoneOf(kind: SectionKind): Zone {
  return SECTION_REGISTRY[kind].zone;
}

/**
 * Addable kinds grouped for the Add Section modal, empty groups dropped.
 *
 * Derived rather than listed, so kind #10 appears in the modal — in the right
 * group, with its icon and description — the moment its registry entry exists.
 */
export function addableKindsByCategory(): {
  id: SectionCategory;
  label: string;
  kinds: SectionKind[];
}[] {
  return SECTION_CATEGORIES.map(({ id, label }) => ({
    id,
    label,
    kinds: addableKinds().filter((kind) => SECTION_REGISTRY[kind].category === id),
  })).filter((group) => group.kinds.length > 0);
}

/**
 * What to call a section in the layers panel: the merchant's own heading if they
 * have written one, otherwise the kind's label.
 *
 * Structurally typed rather than taking a `Section` so this module stays
 * importable by anything without pulling the union in behind it.
 */
export function sectionTitle(section: { kind: SectionKind; props: unknown }): string {
  const def = getSectionDefinition(section.kind);
  if (!def) return "Unknown section";

  if (def.titleField && section.props && typeof section.props === "object") {
    const raw = (section.props as Record<string, unknown>)[def.titleField];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }

  return def.label;
}

/** Whether this kind pulls anything live from the POS — drives the ⚡ marker. */
export function isLiveBound(kind: SectionKind): boolean {
  const def = getSectionDefinition(kind);
  return !!def && def.bindingTypes.length > 0;
}

/**
 * Whether a document contains anything that needs the site's events fetched.
 *
 * The events list is one round trip that most pages have no use for, so it is
 * conditional — and the condition has to be identical on the public renderer
 * and in the builder canvas, or a section renders in one and is blank in the
 * other. Deriving it from `usesEvents` is what makes those two call sites
 * incapable of drifting apart; the string literal they both used before was
 * already wrong for every kind added after `events`.
 *
 * Structurally typed, like `sectionTitle`, so callers need not import the
 * `Section` union to ask.
 */
export function pageNeedsEvents(sections: readonly { kind: string }[]): boolean {
  return sections.some((section) => getSectionDefinition(section.kind)?.usesEvents === true);
}
