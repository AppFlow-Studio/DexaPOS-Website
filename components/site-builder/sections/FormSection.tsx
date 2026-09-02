import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";
import { formStateFor } from "@/lib/site-builder/forms/protocol";
import PublicForm from "../forms/PublicForm";

/**
 * One of the merchant's forms, embedded on a page.
 *
 * A **server component**, like every other section — and so is the form inside
 * it. `PublicForm` is a native `<form method="post">` with no JavaScript at
 * all, following the precedent `HeaderSection` set with its `<details>` menu:
 * sections render on the server and stay server-only. A form is the one thing
 * on a marketing site that must work even when a script bundle does not.
 *
 * The section stores only a `formId`; the definition arrives through
 * `ctx.resolveForm`. Publicly that resolves the *published* definition, so a
 * merchant editing a form does not change what live visitors are filling in
 * until they publish it.
 */
export default function FormSection({ section, ctx }: SectionRenderProps<"form">) {
  const { formId, title, subtitle } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const resolved = formId ? ctx.resolveForm(formId) : null;

  // Nothing chosen yet, or the form has since been deleted or unpublished. The
  // merchant is told in the builder; a visitor is shown nothing at all, which
  // is the only honest option — an empty box asking for a name that goes
  // nowhere is worse than a shorter page.
  if (!resolved) {
    if (ctx.mode !== "builder") return null;

    return (
      <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style, ctx.theme)}>
        <Container>
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-60">
            {formId
              ? "This form is no longer available. Choose another in this section's settings."
              : "Choose which form to show in this section's settings."}
          </p>
        </Container>
      </section>
    );
  }

  return (
    <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style, ctx.theme)}>
      <Container>
        {/*
          The placement's own wording wins over the form's, because the same
          enquiry form is "Book your party" on one page and "Get in touch" on
          another. Falling back to the form's title means a merchant who picks a
          form and types nothing still gets a heading.
        */}
        <SectionHeading
          heading={title || resolved.doc.title}
          subheading={subtitle || resolved.doc.intro}
          align={section.style?.align}
          headingAttrs={f("props.title")}
          subheadingAttrs={f("props.subtitle")}
        />

        <div className="mx-auto max-w-xl">
          <PublicForm
            formId={resolved.id}
            siteId={ctx.site.siteId}
            doc={resolved.doc}
            // In the builder the fields render but nothing may be sent: a
            // merchant testing their own layout must not add a fake lead to
            // their own inbox, and there is no page to redirect them to.
            interactive={ctx.mode === "public"}
            state={formStateFor(resolved.id, ctx.formState)}
            renderedAt={ctx.renderedAt}
          />
        </div>
      </Container>
    </section>
  );
}
