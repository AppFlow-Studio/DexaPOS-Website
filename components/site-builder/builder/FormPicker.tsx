"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { ListForms, type FormSummary } from "@/app/dashboard/website/actions/forms";
import { websiteRoutes } from "../routes";

/**
 * Choosing which of the merchant's forms a `form` section shows.
 *
 * A picker rather than a text field, because the section stores a form *id* —
 * the indirection that makes a form reusable across pages with one inbox behind
 * it. Asking a merchant to paste a uuid would be asking them to understand that
 * indirection, which is our problem and not theirs.
 *
 * Loaded when the drawer opens rather than on mount: most sections are not
 * forms, and this is a round trip.
 */
export default function FormPicker({
  value,
  onChange,
  locationId,
  clerkOrgId,
}: {
  value: string;
  onChange: (formId: string) => void;
  locationId: string;
  clerkOrgId: string;
}) {
  const [forms, setForms] = useState<FormSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    ListForms(clerkOrgId)
      .then((result) => {
        if (!cancelled) setForms(result.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setForms([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clerkOrgId]);

  if (forms === null) {
    return <p className="text-[11px] text-muted-foreground">Loading your forms…</p>;
  }

  if (forms.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          You have no forms yet. Create one, then come back and choose it here.
        </p>
        <a
          href={websiteRoutes.forms(locationId)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium underline underline-offset-2"
        >
          Go to Forms
          <ExternalLink className="size-3" />
        </a>
      </div>
    );
  }

  return (
    <div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <option value="">Choose a form…</option>
        {forms.map((form) => (
          <option key={form.id} value={form.id}>
            {form.name}
            {form.publishedAt ? "" : " (not published)"}
          </option>
        ))}
      </select>

      {/*
        A form that has never been published renders nothing to a visitor, and
        that is invisible from the page editor — the merchant sees their form in
        the canvas because the canvas resolves drafts. Worth saying here rather
        than letting them publish a page with a hole in it.
      */}
      {value && forms.find((form) => form.id === value && !form.publishedAt) && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          This form has not been published yet, so guests will not see it until you publish it from
          the Forms screen.
        </p>
      )}
    </div>
  );
}
