import {
  FIELD_REGISTRY,
  type FormField,
} from "@/lib/site-builder/forms/fields";
import type { FormDocument } from "@/lib/site-builder/forms/document";
import {
  FORM_SUBMIT_PATH,
  HONEYPOT_FIELD,
  RENDERED_AT_FIELD,
} from "@/lib/site-builder/forms/protocol";
import { trackViewAttrs } from "@/lib/site-builder/tracking";

/**
 * A merchant's form, as a visitor sees it.
 *
 * **A server component with no JavaScript at all**, and that is the whole
 * design. It is a native `<form method="post">` posting to a route handler,
 * which validates, stores, and redirects back — so it works with scripts
 * blocked, on a slow connection, and before hydration.
 *
 * That follows the precedent `HeaderSection` already set with its `<details>`
 * navigation menu: sections render on the server and stay server-only. The
 * alternative — a client island doing `fetch` — would have been the reflex
 * choice, and it would have meant a restaurant's catering enquiry form silently
 * doing nothing for anyone whose script bundle failed. A form is the one thing
 * on a marketing site that *must* work.
 *
 * Validation the browser can do, the browser does: `required`, `type="email"`,
 * `type="tel"`. Everything is checked again on the server against the
 * authoritative definition, because none of it is trustworthy.
 */
export default function PublicForm({
  formId,
  siteId,
  doc,
  interactive,
  state,
  renderedAt,
}: {
  formId: string;
  siteId: string;
  doc: FormDocument;
  /**
   * When the page was served. Supplied by the render context rather than read
   * here, because a component must not call `Date.now()` during render.
   */
  renderedAt?: number;
  /** False in the builder canvas: the fields render, but nothing may be sent. */
  interactive: boolean;
  /** Set after a redirect back from the submit handler. */
  state?: "submitted" | "error";
}) {
  if (state === "submitted") {
    return (
      <div
        {...trackViewAttrs("form_submit")}
        // Focus lands here after the redirect, so a screen-reader user is told
        // what happened rather than being returned to the top of a page whose
        // form has quietly vanished.
        tabIndex={-1}
        role="status"
        className="rounded-[var(--site-radius)] border p-6 text-center"
        style={{ borderColor: "var(--site-border)", background: "var(--site-surface-muted)" }}
      >
        <p className="text-base font-medium">{doc.confirmation.message}</p>
      </div>
    );
  }

  return (
    <form
      method="post"
      action={interactive ? FORM_SUBMIT_PATH : undefined}
      // Native validation is a real accessibility win and costs nothing, but the
      // server is what decides.
      className="space-y-5"
    >
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="siteId" value={siteId} />
      {renderedAt ? (
        <input type="hidden" name={RENDERED_AT_FIELD} value={String(renderedAt)} />
      ) : null}

      {/*
        The honeypot. A field no human ever sees and no human ever fills, which
        is the actual filter against the bulk of automated submissions — the
        timing check beside it is a soft secondary signal.

        Hidden with inline styles rather than `type="hidden"` on purpose: a
        hidden input is trivially skipped by a bot reading the DOM, whereas one
        that looks like a real field is not. `tabIndex={-1}` and
        `aria-hidden` keep it away from keyboard and screen-reader users.
      */}
      <div aria-hidden style={{ position: "absolute", left: "-9999px" }}>
        <label htmlFor={`${formId}-${HONEYPOT_FIELD}`}>Company website</label>
        <input
          id={`${formId}-${HONEYPOT_FIELD}`}
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {state === "error" && (
        <p
          role="alert"
          className="rounded-[var(--site-radius)] border p-3 text-sm"
          style={{ borderColor: "var(--site-border)", background: "var(--site-surface-muted)" }}
        >
          Something in the form needs another look. Please check your answers and try again.
        </p>
      )}

      {doc.fields.map((field) => (
        <FieldControl key={field.id} field={field} formId={formId} />
      ))}

      <button
        type="submit"
        disabled={!interactive}
        className="inline-flex items-center justify-center rounded-[var(--site-radius)] px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--site-brand)", color: "var(--site-brand-contrast)" }}
      >
        {doc.settings.submitLabel}
      </button>
    </form>
  );
}

function FieldControl({ field, formId }: { field: FormField; formId: string }) {
  const def = FIELD_REGISTRY[field.kind];
  const props = field.props as Record<string, unknown>;
  const id = `${formId}-${field.id}`;

  if (def.role === "layout") {
    const text = String(props.text ?? "");
    return field.kind === "heading" ? (
      <h3 className="pt-2 text-lg font-semibold tracking-tight">{text}</h3>
    ) : (
      <p className="text-sm leading-relaxed opacity-75">{text}</p>
    );
  }

  const label = String(props.label ?? def.label);
  const required = props.required === true;
  const help = typeof props.help === "string" ? props.help : undefined;
  const placeholder = typeof props.placeholder === "string" ? props.placeholder : undefined;
  const helpId = help ? `${id}-help` : undefined;

  const labelEl = (
    <span className="mb-1.5 block text-sm font-medium">
      {label}
      {/* The asterisk is decorative — `required` on the input is what actually
          tells assistive technology, so it is hidden from the accessible name. */}
      {required && (
        <span aria-hidden className="ml-0.5" style={{ color: "var(--site-brand)" }}>
          *
        </span>
      )}
    </span>
  );

  const helpEl = help ? (
    <span id={helpId} className="mt-1.5 block text-xs opacity-70">
      {help}
    </span>
  ) : null;

  // Choice groups are a fieldset rather than a label: one label cannot name
  // several inputs, and a radio group with no group name is one of the most
  // common real accessibility failures on restaurant sites.
  if (field.kind === "single-choice" || field.kind === "multiple-choice") {
    const options = Array.isArray(props.options) ? (props.options as string[]) : [];
    const type = field.kind === "single-choice" ? "radio" : "checkbox";

    return (
      <fieldset aria-describedby={helpId}>
        <legend className="mb-1.5 block text-sm font-medium">
          {label}
          {required && (
            <span aria-hidden className="ml-0.5" style={{ color: "var(--site-brand)" }}>
              *
            </span>
          )}
        </legend>
        <div className="space-y-1.5">
          {options.map((option, index) => (
            <label key={index} className="flex items-center gap-2 text-sm">
              <input
                type={type}
                name={field.id}
                value={option}
                // Native `required` on a radio group means "one of these";
                // on checkboxes it would mean "this specific box", which is not
                // what the merchant asked for, so it is left to the server.
                required={required && type === "radio"}
              />
              {option}
            </label>
          ))}
        </div>
        {helpEl}
      </fieldset>
    );
  }

  return (
    <label htmlFor={id} className="block">
      {labelEl}
      {field.kind === "text" && props.multiline === true ? (
        <textarea
          id={id}
          name={field.id}
          rows={4}
          required={required}
          placeholder={placeholder}
          aria-describedby={helpId}
          maxLength={2000}
          className={CONTROL_CLASS}
          style={CONTROL_STYLE}
        />
      ) : (
        <input
          id={id}
          name={field.id}
          type={inputType(field.kind)}
          required={required}
          placeholder={placeholder}
          aria-describedby={helpId}
          autoComplete={autoCompleteFor(field.kind)}
          maxLength={200}
          className={CONTROL_CLASS}
          style={CONTROL_STYLE}
        />
      )}
      {helpEl}
    </label>
  );
}

function inputType(kind: FormField["kind"]): string {
  switch (kind) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "datetime":
      return "date";
    default:
      return "text";
  }
}

/**
 * Lets a browser fill in what it already knows.
 *
 * Worth the four lines: autofill is the single biggest thing standing between a
 * visitor on a phone and a completed enquiry form, and the semantic field kinds
 * mean we can name these correctly instead of guessing from a label.
 */
function autoCompleteFor(kind: FormField["kind"]): string | undefined {
  switch (kind) {
    case "name":
      return "name";
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "address":
      return "street-address";
    default:
      return undefined;
  }
}

const CONTROL_CLASS =
  "w-full rounded-[var(--site-radius)] border px-3 py-2.5 text-sm outline-none focus-visible:ring-2";

const CONTROL_STYLE = {
  borderColor: "var(--site-border)",
  background: "var(--site-surface)",
  color: "var(--site-text)",
} as const;
