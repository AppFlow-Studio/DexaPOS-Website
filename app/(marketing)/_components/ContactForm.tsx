"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  submitDemoRequest,
  type DemoRequestState,
} from "../actions/submit-demo-request";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="submit-btn" disabled={pending}>
      {pending ? "Sending…" : "Request Demo"}
      {!pending && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}

export default function ContactForm() {
  const [state, formAction] = useActionState<DemoRequestState, FormData>(
    submitDemoRequest,
    null,
  );

  if (state?.ok) {
    return (
      <div className="form-success show">
        <div className="success-icon">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        </div>
        <h2>Got it. We&apos;ll be in touch.</h2>
        <p>
          Expect a call or email within one business day. If your matter is
          urgent, you can reach us directly at <strong>(555) 555-DEXA</strong>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2>Request your demo</h2>
      <p>Takes 60 seconds. We don&apos;t share your information.</p>

      <form action={formAction}>
        <div className="field">
          <label htmlFor="business">Business name</label>
          <input
            type="text"
            id="business"
            name="business"
            required
            placeholder="e.g. The Pasta House"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="contact">Your name</label>
            <input
              type="text"
              id="contact"
              name="contact"
              required
              placeholder="First and last"
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              required
              placeholder="(555) 555-5555"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            placeholder="you@restaurant.com"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="concept">Concept</label>
            <select id="concept" name="concept" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              <option value="qsr">Quick-Service</option>
              <option value="fine">Fine Dining</option>
              <option value="cafe">Café / Coffee Shop</option>
              <option value="pizzeria">Pizzeria</option>
              <option value="truck">Food Truck</option>
              <option value="bar">Bar / Lounge</option>
              <option value="deli">Deli / Market</option>
              <option value="catering">Catering / Events</option>
              <option value="multi">Multi-Location Group</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="locations">Locations</label>
            <select id="locations" name="locations" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              <option value="1">1 location</option>
              <option value="2-5">2–5</option>
              <option value="6-10">6–10</option>
              <option value="11-25">11–25</option>
              <option value="26-50">26–50</option>
              <option value="50+">50+</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="current">What POS are you on today?</label>
          <input
            type="text"
            id="current"
            name="current"
            placeholder="Toast, Square, Clover, none, etc."
          />
        </div>

        <div className="field">
          <label htmlFor="message">Anything specific to mention?</label>
          <textarea
            id="message"
            name="message"
            placeholder="Migration timing, feature questions, hardware constraints — whatever's on your mind."
          />
        </div>

        {state?.error && (
          <p
            role="alert"
            style={{
              color: "var(--danger)",
              fontSize: 13,
              margin: "4px 0 12px",
              fontWeight: 500,
            }}
          >
            {state.error}
          </p>
        )}

        <SubmitButton />

        <p className="form-foot">
          By submitting, you agree to be contacted by our team about scheduling
          a demo. We don&apos;t sell your information or add you to any marketing
          list without your consent.
        </p>
      </form>
    </div>
  );
}
