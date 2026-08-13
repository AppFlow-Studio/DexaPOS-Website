"use client";

/**
 * The FAQ's interactive layer.
 *
 * One of only two client components in the entire renderer. It is imported
 * *into* a server component rather than making the section itself a client
 * component — that discipline is what keeps a single set of section renderers
 * usable by both the public site and the builder canvas (ANALYSIS blocker B7).
 *
 * Built on `<details>` so the content is present, expandable and accessible
 * before any JavaScript runs, which matters for indexability and for anyone on
 * a slow connection.
 */

export default function FaqAccordion({
  items,
  defaultOpenFirst,
  fieldAttrs,
}: {
  items: { question: string; answerHtml: string }[];
  defaultOpenFirst: boolean;
  /** Builder edit attributes, computed server-side and passed through inert. */
  fieldAttrs?: (index: number, field: "question" | "answer") => Record<string, string | undefined>;
}) {
  return (
    <div className="divide-y" style={{ borderColor: "var(--site-border)" }}>
      {items.map((item, index) => (
        <details
          key={`${item.question}-${index}`}
          open={defaultOpenFirst && index === 0}
          className="group py-4"
        >
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium"
            {...fieldAttrs?.(index, "question")}
          >
            <span>{item.question}</span>
            <span
              aria-hidden="true"
              className="shrink-0 text-xl leading-none opacity-50 transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div
            className="site-prose mt-3 text-sm leading-relaxed opacity-75"
            {...fieldAttrs?.(index, "answer")}
            dangerouslySetInnerHTML={{ __html: item.answerHtml }}
          />
        </details>
      ))}
    </div>
  );
}
