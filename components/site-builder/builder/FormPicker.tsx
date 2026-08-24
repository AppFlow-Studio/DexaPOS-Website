"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { ListForms, type FormSummary } from "@/app/dashboard/website/actions/forms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { websiteRoutes } from "../routes";

/**
 * Radix refuses an item with an empty value, so "nothing chosen" needs a name
 * of its own. It never leaves this component: it is translated back to the
 * empty string the section schema stores.
 */
const NONE = "__none__";

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

  const chosenUnpublished = forms.find((form) => form.id === value && !form.publishedAt);

  return (
    <div>
      {/* The app's own Select, not a bare `<select>`: this was the one control
          in the drawer rendering as the operating system drew it. */}
      <Select
        value={value || NONE}
        onValueChange={(next) => onChange(next === NONE ? "" : next)}
      >
        <SelectTrigger className="w-full" aria-label="Form">
          <SelectValue placeholder="Choose a form…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Choose a form…</SelectItem>
          {forms.map((form) => (
            <SelectItem key={form.id} value={form.id}>
              {form.name}
              {form.publishedAt ? "" : " (not published)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/*
        A form that has never been published renders nothing to a visitor, and
        that is invisible from the page editor — the merchant sees their form in
        the canvas because the canvas resolves drafts.

        Styled as a warning rather than as help text. It said the right thing in
        `text-muted-foreground`, which is the same treatment as every hint in
        the drawer, so it read as guidance rather than as "the section you just
        configured will be empty on your live page".

        Selection is deliberately *not* blocked: choosing a form and publishing
        it afterwards is a legitimate order of work.
      */}
      {chosenUnpublished && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-destructive">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            “{chosenUnpublished.name}” has not been published yet, so guests will not see it until
            you publish it from the Forms screen.
          </span>
        </p>
      )}
    </div>
  );
}
