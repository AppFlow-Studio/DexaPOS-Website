"use client";

import { Check, Plus, Save, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  UpdateSiteBrand,
  UpdateSiteFeatures,
  UpdateSiteSeo,
} from "@/app/dashboard/website/actions/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  FEATURE_DESCRIPTIONS,
  FEATURE_LABELS,
  MAX_BRAND_NAME,
  MAX_CUISINES,
  MAX_SEO_DESCRIPTION,
  MAX_SEO_SUFFIX,
  PRICE_RANGE_HINTS,
  SETTINGS_CARD_FEATURES,
  PRICE_RANGES,
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  httpUrlSchema,
  type SiteBrand,
  type SiteFeature,
  type SiteFeatures,
  type SiteSeo,
  UNAVAILABLE_FEATURES,
  type SocialPlatform,
} from "@/lib/site-builder/site-settings";
import ListHeader from "../shell/ListHeader";

/**
 * The brand layer, as one screen.
 *
 * **One save for the whole screen, not one per card.** These settings are read
 * together and a merchant setting up their website changes several at once; a
 * Save button per card would mean four confirmations for one sitting, and the
 * near-certainty of leaving one behind. The bar appears only once something has
 * changed, and it says what will happen.
 *
 * **Nothing here autosaves.** The page editor autosaves because a draft is
 * private until published — nobody sees a half-finished paragraph. These go
 * live the instant they are stored: turning Reservations on puts a button in
 * every visitor's header. That is the same bargain the navigation editor makes,
 * and it is why both have an explicit save and say so.
 */
export default function SettingsScreen({
  clerkOrgId,
  siteId,
  features: savedFeatures,
  brand: savedBrand,
  seo: savedSeo,
  locations,
  merchantName,
}: {
  clerkOrgId: string;
  siteId: string;
  features: SiteFeatures;
  brand: SiteBrand;
  seo: SiteSeo;
  locations: { id: string; name: string }[];
  /**
   * What the site calls itself when the field below is blank. Shown as the
   * placeholder so the merchant can see the default rather than guess at it.
   */
  merchantName: string;
}) {
  const [features, setFeatures] = useState(savedFeatures);
  const [brand, setBrand] = useState(savedBrand);
  const [seo, setSeo] = useState(savedSeo);
  const [pending, startTransition] = useTransition();

  const featuresDirty = useMemo(
    () => JSON.stringify(features) !== JSON.stringify(savedFeatures),
    [features, savedFeatures],
  );
  const brandDirty = useMemo(
    () => JSON.stringify(brand) !== JSON.stringify(savedBrand),
    [brand, savedBrand],
  );
  const seoDirty = useMemo(
    () => JSON.stringify(seo) !== JSON.stringify(savedSeo),
    [seo, savedSeo],
  );
  const dirty = featuresDirty || brandDirty || seoDirty;

  const patchBrand = (patch: Partial<SiteBrand>) => setBrand((current) => ({ ...current, ...patch }));

  // What the site calls itself as things stand, mirroring `siteDisplayName`'s
  // precedence. Read off the *unsaved* brand name so the search-appearance
  // placeholder tracks the field above it rather than going stale mid-edit.
  const siteName = brand.name?.trim() || merchantName;

  const save = () => {
    startTransition(async () => {
      // Only what changed. Two round trips at worst, none in the common case of
      // a merchant flipping one toggle and pressing save.
      const results = await Promise.all([
        featuresDirty ? UpdateSiteFeatures(clerkOrgId, siteId, features) : null,
        brandDirty ? UpdateSiteBrand(clerkOrgId, siteId, brand) : null,
        seoDirty ? UpdateSiteSeo(clerkOrgId, siteId, seo) : null,
      ]);

      const failure = results.find((result) => result?.error);
      if (failure?.error) {
        toast.error(failure.error);
        return;
      }

      // No reservations-page reconciliation here any more. The switch that
      // decides whether that page should exist lives on the Reservations
      // screen, and `SetReservationsEnabled` stores the decision and reconciles
      // the page in one action — so this screen cannot leave the two disagreeing
      // by saving a brand change without following it.
      toast.success("Website settings saved.");
      // Deliberately not router.refresh(): the server props are already
      // revalidated by the actions, and a refresh here would race the
      // transition and flash the old values back for a frame.
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
      <ListHeader
        title="Website settings"
        subtitle="What your website offers, and the details every page shows."
      />

      <Card
        title="Business name"
        description="What your website calls you, in the header and the footer of every page."
      >
        <div className="space-y-2 p-4">
          <Input
            value={brand.name ?? ""}
            maxLength={MAX_BRAND_NAME}
            placeholder={merchantName}
            aria-label="Business name"
            className="w-full sm:w-96"
            onChange={(e) => {
              // Empty means "use the default", which is an absent key rather
              // than an empty string — `siteBrandSchema` treats the field as
              // optional and a stored "" would render a site with no name.
              const next = e.target.value;
              patchBrand({ name: next.trim() ? next : undefined });
            }}
          />
          <p className="text-xs text-muted-foreground">
            Leave this empty to use <span className="font-medium text-foreground">{merchantName}</span>.
            Your branches keep their own names on your ordering pages — this is the name for the
            website as a whole.
          </p>
        </div>
      </Card>

      <Card
        title="Search appearance"
        description="How your website shows up in Google and when someone shares a link to it."
      >
        <div className="space-y-5 p-4">
          <div className="space-y-2">
            <FieldLabel>Site name in search results</FieldLabel>
            <Input
              value={seo.titleSuffix ?? ""}
              maxLength={MAX_SEO_SUFFIX}
              placeholder={siteName}
              aria-label="Site name in search results"
              className="w-full sm:w-96"
              onChange={(e) => {
                // Empty means "use the default" — an absent key, never a stored
                // empty string, which would put every page back to a bare
                // "Home" with nothing after it.
                const next = e.target.value;
                setSeo((current) => ({
                  ...current,
                  titleSuffix: next.trim() ? next : undefined,
                }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Added after each page name, so your home page reads{" "}
              <span className="font-medium text-foreground">
                Home — {seo.titleSuffix?.trim() || siteName}
              </span>
              . Leave it empty to use{" "}
              <span className="font-medium text-foreground">{siteName}</span>.
            </p>
          </div>

          <div className="space-y-2">
            <FieldLabel>Default description</FieldLabel>
            <textarea
              value={seo.description ?? ""}
              maxLength={MAX_SEO_DESCRIPTION}
              rows={3}
              aria-label="Default description"
              placeholder="A wood-fired pizzeria in Brooklyn, open late seven nights a week."
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-[36rem]"
              onChange={(e) => {
                const next = e.target.value;
                setSeo((current) => ({
                  ...current,
                  description: next.trim() ? next : undefined,
                }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              The sentence under your link in search results, used on any page that has not written
              its own. {MAX_SEO_DESCRIPTION - (seo.description?.length ?? 0)} characters left.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="Features"
        description="Turn on what your restaurant actually does. Sections you can add to a page follow from these."
      >
        <div className="divide-y">
          {/* Only the toggles that do something, and only the ones that are
              genuinely just a toggle. Rewards and Gift cards had no consumer
              anywhere in the product, so switching one on promised a capability
              the website could not deliver. Reservations is switched on at the
              top of its own screen, beside the branch switches and service
              times that decide whether it can actually take a booking. */}
          {SETTINGS_CARD_FEATURES.map((feature) => (
            <FeatureRow
              key={feature}
              feature={feature}
              on={features[feature]}
              onChange={(next) => setFeatures((current) => ({ ...current, [feature]: next }))}
            />
          ))}
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Turning one off removes it from the Add Section list. Sections already on a page stay where
          they are — nothing you have published disappears.
        </p>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Reservations are set up under{" "}
          <Link href="/dashboard/website/reservations" className="underline underline-offset-2">
            Website Reservations
          </Link>{" "}
          in the sidebar, where the switch sits with your service times and the branches that take
          bookings.
        </p>
        {Object.keys(UNAVAILABLE_FEATURES).length > 0 && (
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            {(Object.keys(UNAVAILABLE_FEATURES) as SiteFeature[])
              .map((feature) => FEATURE_LABELS[feature])
              .join(" and ")}{" "}
            are on the way. They are not switches yet, because there is nothing behind them to put
            on a page.
          </p>
        )}
      </Card>

      <Card
        title="Social accounts"
        description="Shown in your footer, and used to connect your website to these accounts in search results."
      >
        <SocialEditor
          links={brand.social}
          onChange={(social) => patchBrand({ social })}
        />
      </Card>

      <Card
        title="About your restaurant"
        description="These do not appear on your pages. They tell search engines what kind of restaurant you are."
      >
        <div className="space-y-5 p-4">
          <CuisineEditor
            cuisines={brand.cuisines}
            onChange={(cuisines) => patchBrand({ cuisines })}
          />

          <div>
            <FieldLabel>Price range</FieldLabel>
            <Select
              value={brand.priceRange ?? "none"}
              onValueChange={(value) =>
                patchBrand({
                  priceRange: value === "none" ? undefined : (value as SiteBrand["priceRange"]),
                })
              }
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {PRICE_RANGES.map((range) => (
                  <SelectItem key={range} value={range}>
                    <span className="font-mono">{range}</span>
                    <span className="ml-2 text-muted-foreground">{PRICE_RANGE_HINTS[range]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card
        title="Prices and locations"
        description="What a visitor sees before they have chosen a branch."
      >
        <div className="space-y-5 p-4">
          <div>
            <FieldLabel>Default location</FieldLabel>
            <Select
              value={brand.defaultLocationId ?? "none"}
              onValueChange={(value) =>
                patchBrand({ defaultLocationId: value === "none" ? undefined : value })
              }
            >
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="No default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default — hide prices</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {locations.length > 1
                ? "Your branches can charge different amounts, so pages that are not about one branch hide prices until a guest picks one. Naming a default shows that branch’s prices instead."
                : "Pages that are not about a particular branch hide prices, because there is no single answer to what something costs. With one restaurant there is — name it here and your home page can show its prices."}
            </p>
          </div>

          {/*
            Named for what it does, not for a thing the website does not do.

            This read "Always ask which location" / "Guests choose a branch
            before they see any prices" — which promised a branch chooser that
            has never existed anywhere in the public renderer. What the setting
            actually does is refuse the default above, so pages that are not
            about one branch stay priceless until the guest navigates somewhere
            that is. Withholding is real and worth offering; asking was not.
          */}
          <ToggleRow
            label="Never show prices before a branch is chosen"
            description="Overrides the default above: pages that are not about one branch show no prices at all. Guests see prices once they open a branch's page or start an order."
            on={brand.forceLocationChoice}
            onChange={(forceLocationChoice) => patchBrand({ forceLocationChoice })}
          />
        </div>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 p-3 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">
              These changes go live on your website as soon as you save them.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setFeatures(savedFeatures);
                  setBrand(savedBrand);
                }}
              >
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

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function FeatureRow({
  feature,
  on,
  onChange,
}: {
  feature: SiteFeature;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="px-4 py-3">
      <ToggleRow
        label={FEATURE_LABELS[feature]}
        description={FEATURE_DESCRIPTIONS[feature]}
        on={on}
        onChange={onChange}
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch checked={on} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

/**
 * One row per platform the merchant has an account on.
 *
 * Add-by-platform rather than a free repeater: the platform is a choice from a
 * short list, so the picker is the add button. It also makes "one account per
 * platform" structural instead of a validation message.
 */
function SocialEditor({
  links,
  onChange,
}: {
  links: SiteBrand["social"];
  onChange: (next: SiteBrand["social"]) => void;
}) {
  const used = new Set(links.map((link) => link.platform));
  const remaining = SOCIAL_PLATFORMS.filter((platform) => !used.has(platform));

  return (
    <div className="p-4">
      {links.length > 0 && (
        <ul className="mb-3 space-y-2">
          {links.map((link, index) => (
            <li key={link.platform} className="flex items-start gap-2">
              <span className="mt-2 w-24 shrink-0 text-sm font-medium">
                {SOCIAL_LABELS[link.platform]}
              </span>
              <div className="min-w-0 flex-1">
                <UrlField
                  label={`${SOCIAL_LABELS[link.platform]} address`}
                  hideLabel
                  value={link.url}
                  placeholder="https://instagram.com/your-restaurant"
                  onChange={(url) =>
                    onChange(links.map((other, i) => (i === index ? { ...other, url } : other)))
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5 shrink-0"
                aria-label={`Remove ${SOCIAL_LABELS[link.platform]}`}
                onClick={() => onChange(links.filter((_, i) => i !== index))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {remaining.length > 0 ? (
        <Select
          // A key that changes on every add resets the trigger back to its
          // placeholder; without it the picker keeps showing the platform just
          // added, as though it were still pending.
          key={links.length}
          value=""
          onValueChange={(platform) =>
            onChange([...links, { platform: platform as SocialPlatform, url: "" }])
          }
        >
          <SelectTrigger className="w-full sm:w-56">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Plus className="size-4" />
              Add an account
            </span>
          </SelectTrigger>
          <SelectContent>
            {remaining.map((platform) => (
              <SelectItem key={platform} value={platform}>
                {SOCIAL_LABELS[platform]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">Every account we support is listed above.</p>
      )}
    </div>
  );
}

/**
 * Cuisines, as chips.
 *
 * Free text rather than a fixed taxonomy, because ours would be wrong for
 * somebody within a week; short and few, because these are search terms and a
 * list of twelve says nothing.
 */
function CuisineEditor({
  cuisines,
  onChange,
}: {
  cuisines: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = cuisines.length >= MAX_CUISINES;

  const add = () => {
    const value = draft.trim().slice(0, 40);
    if (!value || full) return;
    // Case-insensitive, because "Thai" and "thai" are one cuisine and two chips.
    if (cuisines.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...cuisines, value]);
    setDraft("");
  };

  return (
    <div>
      <FieldLabel>
        Cuisines{" "}
        <span className="font-normal text-muted-foreground">
          {cuisines.length}/{MAX_CUISINES}
        </span>
      </FieldLabel>

      {cuisines.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {cuisines.map((cuisine) => (
            <li key={cuisine}>
              <span className="inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-xs">
                {cuisine}
                <button
                  type="button"
                  aria-label={`Remove ${cuisine}`}
                  onClick={() => onChange(cuisines.filter((other) => other !== cuisine))}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          disabled={full}
          maxLength={40}
          placeholder={full ? "That is as many as search engines read" : "Thai, Pizza, Vegan…"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds a chip rather than submitting anything — this screen
            // has no form and one committing button, at the bottom.
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          className="w-full sm:w-72"
        />
        <Button type="button" variant="outline" disabled={full || !draft.trim()} onClick={add}>
          <Check className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * A web address field that says so before it is saved.
 *
 * The server rejects anything that is not `http(s)://…`, and a merchant who
 * typed `instagram.com/…` would otherwise learn that from a toast after
 * pressing Save at the bottom of a long screen, with no idea which of six
 * fields it meant.
 */
function UrlField({
  label,
  hideLabel = false,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const invalid = value.trim().length > 0 && !httpUrlSchema.safeParse(value).success;

  return (
    <div>
      {hideLabel ? null : <FieldLabel>{label}</FieldLabel>}
      <Input
        type="url"
        inputMode="url"
        aria-label={hideLabel ? label : undefined}
        aria-invalid={invalid || undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={hideLabel ? undefined : "w-full sm:w-96"}
      />
      {invalid && (
        <p className="mt-1 text-xs text-destructive">
          Start with https:// — that is the whole address, copied from your browser.
        </p>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-medium">{children}</span>;
}
