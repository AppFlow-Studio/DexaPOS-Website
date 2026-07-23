export type SectionType =
  | "hero"
  | "rich_text"
  | "image"
  | "video"
  | "cards"
  | "cta"
  | "stats"
  | "compare"
  | "industries"
  | "pricing_calculator"
  | "demo_frame"
  | "contact_form"
  | "faq"
  | "annotations"
  | "core_features"
  | "capabilities"
  | "compare_strip";

export interface SectionItem {
  title?: string;
  description?: string;
  image?: string;
  image_alt?: string;
  icon?: string;
  link?: string;
  link_text?: string;
  tags?: string[];
}

export interface CompareCellStyle {
  tone?: "default" | "positive" | "muted" | "strong";
  icon?: "check" | "x" | "none";
}

export interface Section {
  id: string;
  type: SectionType;
  heading?: string;
  heading_accent?: string;
  subheading?: string;
  body?: string;
  lede?: string;
  buttons?: { text: string; link: string; style: string }[];
  background_color?: string;
  background_image?: string;
  main_image?: string;
  main_image_alt?: string;
  floating_title?: string;
  floating_text?: string;
  alignment?: string;
  src?: string;
  alt?: string;
  caption?: string;
  url?: string;
  video_type?: string;
  items?: SectionItem[];
  compare_columns?: string[];
  compare_rows?: string[][];
  compare_cell_styles?: CompareCellStyle[][];
  button_text?: string;
  button_link?: string;
  success_heading?: string;
  success_body?: string;
  error_text?: string;
  footnote?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_hours?: string;
  form_fields?: {
    name: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: { value: string; label: string }[];
  }[];
  settings?: {
    background?: string;
    padding?: string;
    [key: string]: unknown;
  };
}

export type SectionField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "richtext" | "image" | "color" | "select" | "buttons" | "url";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export const SECTION_META: Record<SectionType, { label: string; icon: string; fields: SectionField[] }> = {
  hero: {
    label: "Hero",
    icon: "H",
    fields: [
      { key: "heading", label: "Main heading", type: "text", placeholder: "Run a smarter restaurant." },
      { key: "heading_accent", label: "Accent heading", type: "text", placeholder: "Start to finish." },
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
      { key: "buttons", label: "Hero buttons", type: "buttons" },
      { key: "background_color", label: "Background color", type: "color" },
      { key: "background_image", label: "Background image", type: "image" },
      { key: "main_image", label: "Hero visual image (right side)", type: "image" },
      { key: "main_image_alt", label: "Hero visual alt text", type: "text" },
      { key: "floating_title", label: "Floating card title", type: "text", placeholder: "Live order processed" },
      { key: "floating_text", label: "Floating card text", type: "text", placeholder: "$87.64 · Card · Just now" },
      { key: "alignment", label: "Alignment", type: "select", options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }] },
    ],
  },
  rich_text: {
    label: "Rich Text",
    icon: "R",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Content", type: "richtext" },
    ],
  },
  image: {
    label: "Image",
    icon: "I",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "src", label: "Image", type: "image" },
      { key: "alt", label: "Alt text", type: "text" },
      { key: "caption", label: "Caption", type: "text" },
    ],
  },
  video: {
    label: "Video",
    icon: "V",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "url", label: "Video URL (YouTube/Vimeo)", type: "url" },
      { key: "caption", label: "Caption", type: "text" },
    ],
  },
  cards: {
    label: "Cards Grid",
    icon: "C",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
    ],
  },
  cta: {
    label: "Call to Action",
    icon: "A",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body", type: "textarea" },
      { key: "buttons", label: "CTA buttons", type: "buttons" },
      { key: "background_color", label: "Background color", type: "color" },
    ],
  },
  stats: {
    label: "Stats / Proof",
    icon: "S",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
    ],
  },
  compare: {
    label: "Comparison Table",
    icon: "T",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "heading_accent", label: "Accent heading", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
    ],
  },
  industries: {
    label: "Industries Strip",
    icon: "I",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
      { key: "button_text", label: "Button text", type: "text" },
      { key: "button_link", label: "Button link", type: "text" },
    ],
  },
  pricing_calculator: {
    label: "Pricing Calculator",
    icon: "$",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
    ],
  },
  demo_frame: {
    label: "Interactive Demo",
    icon: "D",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "lede", label: "Hint text", type: "textarea" },
    ],
  },
  contact_form: {
    label: "Contact Form",
    icon: "F",
    fields: [
      { key: "heading", label: "Form heading", type: "text" },
      { key: "lede", label: "Form intro", type: "textarea" },
      { key: "button_text", label: "Submit button text", type: "text" },
      { key: "footnote", label: "Form footnote", type: "textarea" },
      { key: "success_heading", label: "Success heading", type: "text" },
      { key: "success_body", label: "Success body", type: "textarea" },
      { key: "error_text", label: "Error text", type: "textarea" },
      { key: "main_image", label: "Side image", type: "image" },
      { key: "main_image_alt", label: "Side image alt text", type: "text" },
      { key: "contact_phone", label: "Phone text", type: "text" },
      { key: "contact_email", label: "Email text", type: "text" },
      { key: "contact_hours", label: "Hours text", type: "text" },
    ],
  },
  faq: {
    label: "FAQ",
    icon: "Q",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
    ],
  },
  annotations: {
    label: "Annotation Cards",
    icon: "N",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
    ],
  },
  core_features: {
    label: "Core Features Grid",
    icon: "F",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
    ],
  },
  capabilities: {
    label: "Capability Grid",
    icon: "G",
    fields: [
      { key: "subheading", label: "Eyebrow", type: "text" },
      { key: "heading", label: "Heading", type: "text" },
      { key: "lede", label: "Lead paragraph", type: "textarea" },
    ],
  },
  compare_strip: {
    label: "Compare Strip",
    icon: "C",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "body", label: "Body", type: "textarea" },
      { key: "button_text", label: "Button text", type: "text" },
      { key: "button_link", label: "Button link", type: "text" },
    ],
  },
};

export function createSection(type: SectionType): Section {
  return {
    id: crypto.randomUUID(),
    type,
    heading: "",
    heading_accent: "",
    subheading: "",
    body: "",
    lede: "",
    buttons: [],
    background_color: "",
    background_image: "",
    main_image: "",
    main_image_alt: "",
    floating_title: "",
    floating_text: "",
    alignment: "left",
    src: "",
    alt: "",
    caption: "",
    url: "",
    video_type: "youtube",
    items: [],
    compare_columns: [],
    compare_rows: [],
    button_text: "",
    button_link: "",
    success_heading: "",
    success_body: "",
    error_text: "",
    footnote: "",
    contact_phone: "",
    contact_email: "",
    contact_hours: "",
    form_fields: [],
    settings: {},
  };
}

const HERO_HEADING_SPLITS: Record<string, { heading: string; heading_accent: string }> = {
  "Run a smarter restaurant. Start to finish.": {
    heading: "Run a smarter restaurant.",
    heading_accent: "Start to finish.",
  },
  "Honest pricing. Real numbers. No tricks.": {
    heading: "Honest pricing. Real numbers.",
    heading_accent: "No tricks.",
  },
};

export function normalizeSection(section: Section): Section {
  if (section.id === "contact-steps" && section.type === "rich_text") {
    return {
      ...section,
      type: "cards",
      heading: section.heading || "What happens next.",
      subheading: "No pressure, no hard sell. Here's our actual process:",
      body: "",
      items: [
        {
          title: "Day 1 - Discovery call",
          description: "15 minutes. We learn about your concept, your current pain points, and what you're trying to fix. If DEXA isn't a fit, we'll tell you on this call.",
        },
        {
          title: "Day 2-7 - Tailored demo",
          description: "30-minute walkthrough on real hardware, with your menu pre-loaded. We answer the operator-level questions and show you the workflows your team will actually use.",
        },
        {
          title: "Day 8-30 - Migration & cutover",
          description: "If you decide to move forward, our team handles menu rebuild, hardware setup, and one week of on-site coverage during cutover. You're never doing this alone.",
        },
      ],
    };
  }

  if (section.type !== "hero" || section.heading_accent || !section.heading) {
    return section;
  }

  const split = HERO_HEADING_SPLITS[section.heading];
  return split ? { ...section, ...split } : section;
}

export function normalizeSections(sections: Section[]): Section[] {
  return sections.filter((s): s is Section => s !== null).map(normalizeSection);
}

/**
 * Keep CMS edits for known sections while restoring any canonical sections that
 * are missing from an older or partially saved page. Custom sections are kept
 * after the canonical page structure.
 */
export function mergeCanonicalSections(saved: Section[], canonical: Section[]): Section[] {
  const normalizedSaved = normalizeSections(saved);
  const normalizedCanonical = normalizeSections(canonical);
  const savedById = new Map(normalizedSaved.map((section) => [section.id, section]));
  const canonicalIds = new Set(normalizedCanonical.map((section) => section.id));

  return [
    ...normalizedCanonical.map((section) => savedById.get(section.id) || section),
    ...normalizedSaved.filter((section) => !canonicalIds.has(section.id)),
  ];
}
