"use client";

import { Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { UpdateSiteIntegrations } from "@/app/dashboard/website/actions/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TRACKING_PROVIDERS,
  TRACKING_SPECS,
  searchConsoleSpec,
  type SiteTracking,
  type TrackingProvider,
} from "@/lib/site-builder/tracking";
import ListHeader from "../shell/ListHeader";

/**
 * Tracking — the marketing pixels a merchant's agency asks for.
 *
 * **Named Tracking, not Analytics**, because it shows no data (decision W6).
 * Owner calls their equivalent Analytics and it contains four text inputs and a
 * Save button; a merchant clicking a thing called Analytics and finding no
 * numbers files a support ticket, every time. Ours says what it is, and says so
 * again in the subtitle.
 *
 * Five fields and one save. There is nothing to arrange here and no reason for
 * this screen to be more than a form.
 */
export default function TrackingScreen({
  clerkOrgId,
  siteId,
  tracking: saved,
  siteIsLive,
}: {
  clerkOrgId: string;
  siteId: string;
  tracking: SiteTracking;
  /** Whether anything is actually published for these pixels to fire on. */
  siteIsLive: boolean;
}) {
  const [draft, setDraft] = useState<SiteTracking>(saved);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(
    () => JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(saved)),
    [draft, saved],
  );

  const save = () => {
    startTransition(async () => {
      const result = await UpdateSiteIntegrations(clerkOrgId, siteId, draft);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Tracking saved.");
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
      <ListHeader
        title="Tracking"
        subtitle="Marketing pixels for your website. This screen shows no visitor numbers — your orders and revenue are under Reports."
      />

      {!siteIsLive && (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Your website is not published yet, so nothing here will record anything until it is. You
          can set these up now and they will start working the moment you publish.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Advertising pixels</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Added to every page of your website. These are separate from your online ordering
            storefront&rsquo;s pixels, so you can measure marketing and checkout apart if you want
            to.
          </p>
        </div>

        <div className="space-y-5 p-4">
          {TRACKING_PROVIDERS.map((provider) => (
            <TrackingField
              key={provider}
              provider={provider}
              value={draft[provider] ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, [provider]: value }))}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Search Console</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Proves to Google that this website is yours, which is what lets you see the searches
            people find you through.
          </p>
        </div>

        <div className="p-4">
          <Field
            label={searchConsoleSpec.label}
            hint={searchConsoleSpec.hint}
            placeholder={searchConsoleSpec.placeholder}
            pattern={searchConsoleSpec.pattern}
            value={draft.searchConsole ?? ""}
            onChange={(value) => setDraft((current) => ({ ...current, searchConsole: value }))}
          />
        </div>
      </section>

      {/*
        Sticky inside this column, not fixed to the viewport.

        `fixed inset-x-0` spanned the whole window, so the bar ran under the
        dashboard sidebar and the mobile tab bar and looked like a piece of the
        app rather than of this screen. Sticky keeps it pinned to the bottom of
        the reading column, which is where the thing it saves lives. The
        negative margins undo the page padding so the bar still reaches the
        column's edges.
      */}
      {dirty && (
        <div className="sticky bottom-0 -mx-4 border-t bg-background/95 backdrop-blur sm:-mx-6 lg:-mx-8">
          <div className="flex items-center justify-between gap-4 p-3 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">
              These go live on your website as soon as you save them.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDraft(saved)}>
                Discard
              </Button>
              <Button size="sm" disabled={pending} onClick={save}>
                {pending ? "Saving…" : "Save changes"}
                <Save className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrackingField({
  provider,
  value,
  onChange,
}: {
  provider: TrackingProvider;
  value: string;
  onChange: (value: string) => void;
}) {
  const spec = TRACKING_SPECS[provider];
  return (
    <Field
      label={spec.label}
      hint={spec.hint}
      placeholder={spec.placeholder}
      pattern={spec.pattern}
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * One ID field, validating as it is typed.
 *
 * The placeholder is the format documentation — `G-`, `GTM-`, the `C4…` shape —
 * which is the detail worth copying wholesale from Owner: a merchant pasting an
 * ID can see instantly whether they grabbed the right one out of a console full
 * of similar-looking strings.
 *
 * Checked against the same pattern the server enforces, so an invalid ID is
 * caught under the field rather than as a toast after Save. Only once there is
 * something to check — an empty field is how a pixel is removed, not a mistake.
 */
function Field({
  label,
  hint,
  placeholder,
  pattern,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  pattern: RegExp;
  value: string;
  onChange: (value: string) => void;
}) {
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !pattern.test(trimmed.toUpperCase()) && !pattern.test(trimmed);

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium">{label}</span>
        <Input
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          className="w-full font-mono sm:w-96"
        />
      </label>
      <p
        className={`mt-1.5 text-[11px] leading-relaxed ${invalid ? "text-destructive" : "text-muted-foreground"}`}
      >
        {invalid ? `That does not match the expected format — ${placeholder}` : hint}
      </p>
    </div>
  );
}

/** Blank and absent are the same thing; comparing them raw makes every field dirty. */
function normalize(tracking: SiteTracking): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tracking)
      .map(([key, value]) => [key, (value ?? "").trim()])
      .filter(([, value]) => value !== ""),
  );
}
