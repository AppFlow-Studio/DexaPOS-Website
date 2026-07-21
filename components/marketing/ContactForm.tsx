"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

// Must match HONEYPOT_FIELD in src/lib/form-security.ts (kept as a literal so this
// client component doesn't pull the server-only security module into the bundle).
const HONEYPOT_FIELD = "company_website";

type ContactFormField = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

type ContactFormContent = {
  heading?: string;
  intro?: string;
  submitText?: string;
  footnote?: string;
  successHeading?: string;
  successBody?: string;
  errorText?: string;
  fields?: ContactFormField[];
};

const DEFAULT_FIELDS: ContactFormField[] = [
  { name: "business", label: "Business name", placeholder: "e.g. The Pasta House", required: true },
  { name: "contact", label: "Your name", placeholder: "First and last", required: true },
  { name: "phone", label: "Phone", placeholder: "(555) 555-5555", required: true },
  { name: "email", label: "Email", placeholder: "you@restaurant.com", required: true },
  {
    name: "concept",
    label: "Concept",
    required: true,
    options: [
      { value: "", label: "Choose..." },
      { value: "qsr", label: "Quick-Service" },
      { value: "fine", label: "Fine Dining" },
      { value: "cafe", label: "Cafe / Coffee Shop" },
      { value: "pizzeria", label: "Pizzeria" },
      { value: "truck", label: "Food Truck" },
      { value: "bar", label: "Bar / Lounge" },
      { value: "deli", label: "Deli / Market" },
      { value: "catering", label: "Catering / Events" },
      { value: "multi", label: "Multi-Location Group" },
      { value: "other", label: "Other" },
    ],
  },
  {
    name: "locations",
    label: "Locations",
    required: true,
    options: [
      { value: "", label: "Choose..." },
      { value: "1", label: "1 location" },
      { value: "2-5", label: "2-5" },
      { value: "6-10", label: "6-10" },
      { value: "11-25", label: "11-25" },
      { value: "26-50", label: "26-50" },
      { value: "50+", label: "50+" },
    ],
  },
  { name: "current", label: "What POS are you on today?", placeholder: "Toast, Square, Clover, none, etc." },
  { name: "message", label: "Anything specific to mention?", placeholder: "Migration timing, feature questions, hardware constraints - whatever is on your mind." },
];

const fieldType: Record<string, string> = {
  phone: "tel",
  email: "email",
};

export default function ContactForm({ content = {} }: { content?: ContactFormContent }) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const mountedAt = useRef<number | null>(null);
  const fields = content.fields?.length ? content.fields : DEFAULT_FIELDS;

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const required = form.querySelectorAll<HTMLInputElement>("[required]");
    let valid = true;
    required.forEach((el) => {
      if (!el.value.trim()) valid = false;
    });
    if (!valid) return;

    setSubmitting(true);
    setError("");

    const data = new FormData(form);
    const payload = {
      business: data.get("business"),
      contact_name: data.get("contact"),
      phone: data.get("phone"),
      email: data.get("email"),
      concept: data.get("concept"),
      locations: data.get("locations"),
      current_pos: data.get("current") || "",
      message: data.get("message") || "",
      [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD) || "",
      // Time since mount. Fallback keeps a not-yet-initialized ref from ever
      // looking bot-fast (which would falsely reject a real submission).
      elapsed_ms: mountedAt.current == null ? 10000 : Date.now() - mountedAt.current,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to submit");
      setSubmitted(true);
    } catch {
      setError(content.errorText || "Something went wrong. Please email us directly at sales@dexapos.com.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-card reveal in">
      {!submitted ? (
        <div id="formBody">
          <h2>{content.heading || "Request your demo"}</h2>
          <p>{content.intro || "Takes 60 seconds. We don't share your information."}</p>

          <form id="dexaForm" onSubmit={handleSubmit}>
            {/* Honeypot: hidden from real users; bots that fill it are rejected server-side. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
              <label htmlFor={HONEYPOT_FIELD}>Company website</label>
              <input
                type="text"
                id={HONEYPOT_FIELD}
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>
            <ContactFields fields={fields} />

            {error && <p style={{ color: "#ff4444", fontSize: "0.9rem" }}>{error}</p>}
            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? "Submitting..." : content.submitText || "Request Demo"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </button>

            <p className="form-foot">{content.footnote || "By submitting, you agree to be contacted by our team about scheduling a demo. We don't sell your information or add you to any marketing list without your consent."}</p>
          </form>
        </div>
      ) : (
        <div id="formSuccess" className="form-success show">
          <div className="success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
          </div>
          <h2>{content.successHeading || "Got it. We'll be in touch."}</h2>
          <p>{content.successBody || "Expect a call or email within one business day. If your matter is urgent, you can reach us directly at (555) 555-DEXA."}</p>
        </div>
      )}
    </div>
  );
}

function ContactFields({ fields }: { fields: ContactFormField[] }) {
  const rows = [
    fields.filter((field) => field.name === "business"),
    fields.filter((field) => ["contact", "phone"].includes(field.name)),
    fields.filter((field) => field.name === "email"),
    fields.filter((field) => ["concept", "locations"].includes(field.name)),
    fields.filter((field) => field.name === "current"),
    fields.filter((field) => field.name === "message"),
    fields.filter((field) => !["business", "contact", "phone", "email", "concept", "locations", "current", "message"].includes(field.name)),
  ].filter((row) => row.length > 0);

  return (
    <>
      {rows.map((row, index) => (
        <div key={index} className={row.length > 1 ? "field-row" : undefined}>
          {row.map((field) => <ContactField key={field.name} field={field} />)}
        </div>
      ))}
    </>
  );
}

function ContactField({ field }: { field: ContactFormField }) {
  return (
    <div className="field">
      <label htmlFor={field.name}>{field.label}</label>
      {field.options ? (
        <select id={field.name} name={field.name} required={field.required}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : field.name === "message" ? (
        <textarea id={field.name} name={field.name} placeholder={field.placeholder} required={field.required} />
      ) : (
        <input type={fieldType[field.name] || "text"} id={field.name} name={field.name} required={field.required} placeholder={field.placeholder} />
      )}
    </div>
  );
}
