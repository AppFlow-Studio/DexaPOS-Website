import sanitizeHtmlLib from "sanitize-html";

// Pure-JS (htmlparser2) sanitizer — no jsdom/undici, so it builds cleanly on the
// server. Same allowlist the CMS relied on previously (DOMPurify port).
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s",
  "h2", "h3", "h4",
  "ul", "ol", "li",
  "a", "img",
  "blockquote", "pre", "code",
];

// sanitize-html maps attributes per-tag; "*" applies to every allowed tag.
const ALLOWED_ATTR = ["href", "src", "alt", "target", "rel", "class"];

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { "*": ALLOWED_ATTR },
    // Safe URL schemes only; javascript:/data: (except images) are dropped.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
  });
}

// For plain-text fields (contact form and other non-rich-text inputs): strip ALL
// markup so nothing HTML/script can be stored and later rendered. Defense-in-depth
// against stored XSS in any admin viewer that displays these values.
export function sanitizeText(value: string): string {
  return sanitizeHtmlLib(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();
}
