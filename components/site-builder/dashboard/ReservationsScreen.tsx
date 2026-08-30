"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import {
  SetReservationApproval,
  SetReservationsEnabled,
} from "@/app/dashboard/website/actions/reservations-page";
import type { ReservationApprovalMode } from "@/lib/site-builder/site-settings";
import {
  DeleteBlackout,
  DeleteServicePeriod,
  SaveBlackout,
  SaveServicePeriod,
  SetLocationAcceptsReservations,
  UpdateLocationReservationSettings,
} from "@/app/dashboard/website/actions/reservations-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  BLANK_BLACKOUT,
  describeBlackout,
  formatBlackoutDate,
  isPastBlackout,
  validateBlackout,
  type BlackoutInput,
} from "@/lib/site-builder/reservations/blackouts";
import {
  BLANK_SERVICE_PERIOD,
  SLOT_INTERVALS,
  validatePeriod,
  type LocationReservationConfig,
  type ServicePeriodInput,
} from "@/lib/site-builder/reservations/service-periods";
import { cn } from "@/lib/utils";
import ListHeader from "../shell/ListHeader";

/**
 * The two answers, in the guest's language.
 *
 * Deliberately not "confirmed" and "pending" — those are column values. The
 * merchant is picking between two things that happen to a person on their
 * website, and the copy has to be readable by someone who has never seen the
 * reservations table.
 */
const APPROVAL_CHOICES: {
  value: ReservationApprovalMode;
  title: string;
  description: string;
}[] = [
  {
    value: "auto",
    title: "Accept automatically",
    description:
      "Guests are booked straight away and get a confirmation. You do nothing unless you want to change something.",
  },
  {
    value: "manual",
    title: "Review each request",
    description:
      "Guests send a request and wait for your answer. Their table is held while you decide, and they're told either way.",
  },
];

/**
 * When each restaurant seats, and what a guest agrees to when they book.
 *
 * A separate screen from Website Settings on purpose. Settings answers a
 * question about the *business* — do we take bookings on our own site at all —
 * and it is one radio button. This answers a question about each *kitchen*, and
 * a merchant with four branches has four different answers. Putting a
 * four-branch service-times editor inside the brand settings card would bury
 * the one switch that matters under the configuration it unlocks.
 *
 * **Saves per action, not per screen.** The opposite of `SettingsScreen`, and
 * deliberately: these are independent records, a merchant edits one service at
 * a time, and a single Save across four locations' worth of periods would make
 * a partial failure impossible to report usefully.
 */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Today at the merchant's own clock, as `YYYY-MM-DD`. */
function localTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The folds themselves, in `localStorage` and outside React.
 *
 * A reading preference belonging to one person at one desk, not a fact about
 * the restaurant — the owner folding away a branch they have finished should
 * not fold it away for the manager who has not. That rules out the config row
 * and rules out the server.
 */
const COLLAPSE_LISTENERS = new Set<() => void>();
const NO_COLLAPSE = "{}";

function readCollapse(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey) ?? NO_COLLAPSE;
  } catch {
    // A blocked or corrupt store costs a merchant nothing: every branch simply
    // opens. Never let a reading preference break the screen.
    return NO_COLLAPSE;
  }
}

function writeCollapse(storageKey: string, value: Record<string, boolean>) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Same again — the write is lost, so the fold forgets, and nothing else.
  }
  // `storage` events only fire in *other* tabs, so this tab has to tell itself.
  COLLAPSE_LISTENERS.forEach((notify) => notify());
}

function subscribeCollapse(onStoreChange: () => void) {
  COLLAPSE_LISTENERS.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    COLLAPSE_LISTENERS.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * Which branches a merchant has folded away, remembered between visits.
 *
 * Setting up a branch is a one-off; living with four of them is forever. A
 * merchant who has finished with a location collapses it, and it has to stay
 * collapsed — a fold that resets on every navigation is a fold nobody uses,
 * they would scroll past the open forms instead.
 *
 * `useSyncExternalStore` rather than state seeded in an effect: the server has
 * no `localStorage`, so the server snapshot is "nothing folded" and the real
 * one takes over after hydration, with no mismatch and no cascading render. The
 * cost is that a collapsed branch is briefly open on first paint, which is the
 * right way round — content appearing beats content vanishing under a click.
 */
function useCollapsedLocations(siteId: string) {
  const storageKey = `dexa.reservations.collapsed.${siteId}`;

  const raw = useSyncExternalStore(
    subscribeCollapse,
    () => readCollapse(storageKey),
    () => NO_COLLAPSE,
  );

  const collapsed = useMemo<Record<string, boolean>>(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }, [raw]);

  const toggle = useCallback(
    (locationId: string) => {
      writeCollapse(storageKey, { ...collapsed, [locationId]: !collapsed[locationId] });
    },
    [storageKey, collapsed],
  );

  return { collapsed, toggle };
}

/**
 * What a folded branch says about itself.
 *
 * A collapsed section has to be worth collapsing *and* readable at a glance,
 * otherwise a merchant opens each one in turn to find the one they wanted —
 * which is worse than leaving them all open.
 */
function summarise(location: LocationReservationConfig, todayIso: string) {
  const services = location.periods.filter((period) => period.isActive).length;
  const closed = location.blackouts.filter((blackout) => !isPastBlackout(blackout, todayIso)).length;

  const parts = [
    `${services} ${services === 1 ? "service" : "services"}`,
    ...(closed > 0 ? [`${closed} closed ${closed === 1 ? "date" : "dates"}`] : []),
  ];

  return parts.join(" · ");
}

export default function ReservationsScreen({
  clerkOrgId,
  siteId,
  initialConfig,
  initialEnabled,
  initialApproval,
}: {
  clerkOrgId: string;
  siteId: string;
  initialConfig: LocationReservationConfig[];
  /**
   * Whether the website takes bookings at all.
   *
   * This used to live in Website settings, two screens away from the branch
   * switches it governs, so a merchant met two different on/off controls and
   * could not tell which one was in charge. It is the first thing on this
   * screen now, directly above the branches underneath it.
   */
  initialEnabled: boolean;
  /**
   * Whether bookings are accepted on the spot or held for the merchant's
   * answer. One rule for the whole business, so it is not part of
   * `initialConfig`, which is per branch.
   */
  initialApproval: ReservationApprovalMode;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [approval, setApproval] = useState(initialApproval);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [pending, startTransition] = useTransition();
  const { collapsed, toggle: toggleCollapsed } = useCollapsedLocations(siteId);
  const todayIso = localTodayIso();

  const run = (
    work: () => Promise<{ data?: LocationReservationConfig[]; error?: string }>,
    success?: string,
  ) => {
    startTransition(async () => {
      const result = await work();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) setConfig(result.data);
      if (success) toast.success(success);
    });
  };

  /**
   * Turning the whole thing on or off.
   *
   * Separate from `run` because it returns a provisioning outcome rather than a
   * new config, and because what it did needs saying in more than one word: a
   * merchant who switches this on has just had a page created, published and
   * added to their menu, and finding that out by accident later is how they end
   * up with two Reservations pages.
   */
  const toggleEnabled = (next: boolean) => {
    setConfirmingOff(false);
    startTransition(async () => {
      const result = await SetReservationsEnabled(clerkOrgId, siteId, next);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setEnabled(next);

      if (!next) {
        toast.success("Bookings are off. Your reservations page has been taken down.");
        return;
      }

      // `data` is null when the merchant deleted the page themselves at some
      // point: provisioning refuses to resurrect it, on purpose, so say nothing
      // about a page rather than claiming one exists.
      if (!result.data) {
        toast.success("Bookings are on.");
      } else if (result.data.adopted) {
        toast.success("Bookings are on. Added to your existing Reservations page.");
      } else {
        toast.success("Bookings are on. Your reservations page is live.");
      }
    });
  };

  /**
   * Choosing between accepting on the spot and reviewing each request.
   *
   * Its own handler rather than `run`, for the same reason `toggleEnabled` has
   * one: `run` expects a fresh `LocationReservationConfig[]` back and this
   * returns the site row. Nothing per branch moves — the setting is one rule
   * for the business.
   *
   * Optimistic with a rollback, because the cards are a radio group and a
   * selection that does not move when clicked reads as a broken control.
   */
  const chooseApproval = (next: ReservationApprovalMode) => {
    if (next === approval || pending) return;

    const previous = approval;
    setApproval(next);

    startTransition(async () => {
      const result = await SetReservationApproval(clerkOrgId, siteId, next);

      if (result.error) {
        setApproval(previous);
        toast.error(result.error);
        return;
      }

      toast.success(
        next === "manual"
          ? "You'll review each booking request before it's confirmed."
          : "Bookings are confirmed automatically.",
      );
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
      <ListHeader
        title="Reservations"
        subtitle="Whether your website takes bookings, and when each restaurant seats guests."
      />

      {/*
        The master switch, above the branches it governs. Everything below it is
        inert while it is off, so showing it off would be showing a merchant a
        four-branch service-times editor that cannot produce a single bookable
        slot.
      */}
      <section className="rounded-lg border">
        <header className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Take bookings on your website</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Guests pick a table and a time on your own site, and the booking lands on your floor
              plan with a table already assigned.
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={pending}
            aria-label="Take bookings on your website"
            onCheckedChange={(next) => {
              // On is harmless and immediate. Off unpublishes a live page and
              // takes it out of the menu, so it asks first — this is the one
              // control on the screen a merchant can regret.
              if (next) toggleEnabled(true);
              else setConfirmingOff(true);
            }}
          />
        </header>

        {confirmingOff && (
          <div className="border-t p-4">
            <p className="text-sm font-medium">Stop taking bookings?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your reservations page comes down and leaves your menu. Your service times, closed
              dates and booking policy are all kept, so turning this back on restores them.
              Bookings you already have are not cancelled.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleEnabled(false)}>
                Turn bookings off
              </Button>
              <Button size="sm" disabled={pending} onClick={() => setConfirmingOff(false)}>
                Keep taking bookings
              </Button>
            </div>
          </div>
        )}

        {enabled && !confirmingOff && (
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            A Reservations page is on your website and in your menu. Switch on the branches that
            take bookings below, and set the times they seat.
          </p>
        )}

        {/*
          What happens when a guest submits.

          Under the master switch and only while it is on: the choice is
          meaningless for a site that takes no bookings, and everything in this
          section is already understood to be governed by the switch above it.

          Each card describes what the GUEST experiences, not what the database
          stores. A merchant is choosing between two experiences, and "pending"
          is not a word any of them will recognise.
        */}
        {enabled && !confirmingOff && (
          <div className="border-t p-4">
            <h3 className="text-sm font-semibold">When a guest books</h3>
            <div
              role="radiogroup"
              aria-label="When a guest books"
              className="mt-3 grid gap-2 sm:grid-cols-2"
            >
              {APPROVAL_CHOICES.map((choice) => {
                const selected = approval === choice.value;
                return (
                  <button
                    key={choice.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={pending}
                    onClick={() => chooseApproval(choice.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected ? "border-primary" : "border-muted-foreground/40",
                        )}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                      </span>
                      <span className="text-sm font-medium">{choice.title}</span>
                    </span>
                    <span className="mt-1.5 block text-xs text-muted-foreground">
                      {choice.description}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Changing this only affects new bookings. Anything already booked stays exactly as it
              is.
            </p>
          </div>
        )}
      </section>

      {enabled && config.length === 0 && (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          No active locations yet.
        </p>
      )}

      {enabled && config.map((location) => {
        // Only a branch that is taking bookings has anything to fold: with the
        // switch off the section is already just a header.
        const isCollapsed = location.acceptsReservations && Boolean(collapsed[location.locationId]);
        const showBody = location.acceptsReservations && !isCollapsed;

        return (
          <section key={location.locationId} className="rounded-lg border">
            <header
              className={`flex items-center justify-between gap-4 p-4 ${showBody ? "border-b" : ""}`}
            >
              {/*
                The name is the fold control, not just the chevron — a merchant
                reaching for a branch aims at its name, and a 16px target beside
                it is a miss waiting to happen. Disabled rather than hidden
                when the branch is off — there is nothing to fold behind a
                switch that is already off.
              */}
              <button
                type="button"
                disabled={!location.acceptsReservations}
                aria-expanded={location.acceptsReservations ? !isCollapsed : undefined}
                onClick={() => toggleCollapsed(location.locationId)}
                className="-m-1 flex min-w-0 items-center gap-2 rounded p-1 text-left disabled:cursor-default"
              >
                {/*
                  Kept in the layout, not just hidden, when the branch is off:
                  branch names in a list have to line up with each other whether
                  or not each one is taking bookings.
                */}
                <ChevronDown
                  aria-hidden
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                    isCollapsed ? "-rotate-90" : ""
                  } ${location.acceptsReservations ? "" : "invisible"}`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{location.locationName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {isCollapsed
                      ? summarise(location, todayIso)
                      : location.reservableTables > 0
                        ? `${location.reservableTables} bookable ${
                            location.reservableTables === 1 ? "table" : "tables"
                          } on your floor plan`
                        : "No floor plan yet"}
                  </span>
                  {/*
                    A blocker has to survive the fold. Hiding one behind a
                    collapsed branch is how a merchant ends up with a booking page
                    that offers no times and no idea why.
                  */}
                  {isCollapsed && location.blockers.length > 0 && (
                    <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-500">
                      {location.blockers.length} thing
                      {location.blockers.length === 1 ? "" : "s"} to fix before guests can book
                    </span>
                  )}
                </span>
              </button>
              <Switch
                checked={location.acceptsReservations}
                disabled={pending}
                onCheckedChange={(next) =>
                  run(
                    () => SetLocationAcceptsReservations(clerkOrgId, location.locationId, next),
                    next
                      ? `${location.locationName} is now taking bookings.`
                      : `${location.locationName} has stopped taking bookings.`,
                  )
                }
              />
            </header>

            {showBody && (
              <div className="space-y-6 p-4">
                {/*
                  Computed server-side rather than left for the merchant to
                  discover from an empty grid on their live site. Every blocker
                  here produces a page that looks broken while being, technically,
                  configured exactly as asked.
                */}
                {location.blockers.length > 0 && (
                  <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    {location.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Service times
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => SaveServicePeriod(clerkOrgId, location.locationId, BLANK_SERVICE_PERIOD),
                          "Service added.",
                        )
                      }
                    >
                      <Plus className="mr-1 size-3.5" /> Add a service
                    </Button>
                  </div>

                  {location.periods.map((period) => (
                    <PeriodEditor
                      key={period.id}
                      period={period}
                      disabled={pending}
                      onSave={(next) =>
                        run(
                          () => SaveServicePeriod(clerkOrgId, location.locationId, next),
                          "Service times saved.",
                        )
                      }
                      onDelete={() =>
                        run(
                          () => DeleteServicePeriod(clerkOrgId, period.id!),
                          "Service removed.",
                        )
                      }
                    />
                  ))}
                </div>

                <BlackoutsEditor
                  blackouts={location.blackouts}
                  disabled={pending}
                  onSave={(next) =>
                    run(
                      () => SaveBlackout(clerkOrgId, location.locationId, next),
                      "Closed date saved.",
                    )
                  }
                  onDelete={(id) =>
                    run(() => DeleteBlackout(clerkOrgId, id), "Closed date removed.")
                  }
                />

                <PolicyEditor
                  location={location}
                  disabled={pending}
                  onSave={(patch) =>
                    run(
                      () =>
                        UpdateLocationReservationSettings(clerkOrgId, location.locationId, patch),
                      "Booking details saved.",
                    )
                  }
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Days this branch does not seat, on top of its ordinary service times.
 *
 * The first thing a merchant asks for after they find their New Year's Eve
 * buyout on public sale. Without it the only way to close a date is to delete a
 * service period and remember to put it back — which is how a restaurant ends
 * up closed for the whole of January.
 *
 * **A single add form, not an inline row editor.** Unlike a service period,
 * which a merchant tunes repeatedly, a closed date is written once and then
 * either kept or removed. Editing one in place would be a control nobody uses,
 * costing a form's worth of state on a screen that already carries four.
 */
function BlackoutsEditor({
  blackouts,
  disabled,
  onSave,
  onDelete,
}: {
  blackouts: BlackoutInput[];
  disabled: boolean;
  onSave: (next: BlackoutInput) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<BlackoutInput>(BLANK_BLACKOUT);
  const [wholeDay, setWholeDay] = useState(true);

  // Today at the merchant's own clock. Used only to sort spent entries out of
  // the way and to stop a date in the past being added — never to hide a row.
  const todayIso = localTodayIso();

  const upcoming = blackouts.filter((b) => !isPastBlackout(b, todayIso));
  const past = blackouts.filter((b) => isPastBlackout(b, todayIso));

  // The whole-day switch is UI state, not stored state: a closed day IS a row
  // with both times null. Deriving the payload here rather than keeping the
  // times around means a merchant who fills in a window and then ticks "all
  // day" cannot save a contradiction.
  const candidate: BlackoutInput = wholeDay
    ? { ...draft, startTime: null, endTime: null }
    : draft;
  const problem = draft.date ? validateBlackout(candidate) : null;

  const add = () => {
    if (problem || !draft.date) return;
    onSave(candidate);
    setDraft(BLANK_BLACKOUT);
    setWholeDay(true);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Closed dates
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Holidays and private events. Guests see no times on a closed date, and bookings you
          already have are left alone — cancel those yourself if you need to.
        </p>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Nothing closed. Your service times apply every day they run.
        </p>
      )}

      {upcoming.map((blackout) => (
        <BlackoutRow
          key={blackout.id}
          blackout={blackout}
          disabled={disabled}
          onDelete={() => onDelete(blackout.id!)}
        />
      ))}

      {/*
        Kept, but folded away and dimmed. Deleting spent dates automatically
        would mean a merchant could never check whether last year's closure was
        actually recorded.
      */}
      {past.length > 0 && (
        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {past.length} past {past.length === 1 ? "date" : "dates"}
          </summary>
          <div className="mt-2 space-y-2">
            {past.map((blackout) => (
              <BlackoutRow
                key={blackout.id}
                blackout={blackout}
                disabled={disabled}
                muted
                onDelete={() => onDelete(blackout.id!)}
              />
            ))}
          </div>
        </details>
      )}

      <div className="space-y-3 rounded-md border border-dashed p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Date</span>
            <Input
              type="date"
              value={draft.date}
              min={todayIso}
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              className="h-8"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Reason (optional)</span>
            <Input
              value={draft.reason ?? ""}
              placeholder="Private event"
              disabled={disabled}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
              className="h-8"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={wholeDay}
            disabled={disabled}
            onCheckedChange={(next) => {
              setWholeDay(next);
              // Sensible times the moment a window is asked for, so a merchant
              // is never staring at two empty fields wondering what format we
              // want.
              if (!next && !draft.startTime) {
                setDraft((d) => ({ ...d, startTime: "17:00", endTime: "23:00" }));
              }
            }}
          />
          <span>Closed all day</span>
        </label>

        {!wholeDay && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Closed from</span>
              <Input
                type="time"
                value={draft.startTime ?? ""}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
                className="h-8"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Closed until</span>
              <Input
                type="time"
                value={draft.endTime ?? ""}
                disabled={disabled}
                onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
                className="h-8"
              />
            </label>
          </div>
        )}

        {/*
          The database's CHECK constraint in the merchant's words, shown before
          the round trip rather than after it.
        */}
        {problem && <p className="text-xs text-destructive">{problem}</p>}

        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !draft.date || problem !== null}
          onClick={add}
        >
          <Plus className="mr-1 size-3.5" /> Close this date
        </Button>
      </div>
    </div>
  );
}

function BlackoutRow({
  blackout,
  disabled,
  muted,
  onDelete,
}: {
  blackout: BlackoutInput;
  disabled: boolean;
  muted?: boolean;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{formatBlackoutDate(blackout.date)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {describeBlackout(blackout)}
          {blackout.reason ? ` · ${blackout.reason}` : ""}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={onDelete}
        aria-label={`Reopen ${blackout.date}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function PeriodEditor({

  period,
  disabled,
  onSave,
  onDelete,
}: {
  period: ServicePeriodInput;
  disabled: boolean;
  onSave: (next: ServicePeriodInput) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(period);
  const dirty = JSON.stringify(draft) !== JSON.stringify(period);
  // The same rules the database enforces, shown before the round trip rather
  // than after it — a merchant should not have to press Save to be told the
  // last seating cannot be before the first.
  const problem = validatePeriod(draft);

  const patch = (next: Partial<ServicePeriodInput>) =>
    setDraft((current) => ({ ...current, ...next }));

  const toggleDay = (day: number) =>
    patch({
      daysOfWeek: draft.daysOfWeek.includes(day)
        ? draft.daysOfWeek.filter((d) => d !== day)
        : [...draft.daysOfWeek, day].sort(),
    });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="h-8 max-w-[12rem]"
          aria-label="Service name"
        />
        <span className="text-xs text-muted-foreground">
          shown on each time button, so guests can tell lunch from dinner
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          disabled={disabled}
          onClick={onDelete}
          aria-label={`Remove ${draft.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {DAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(day)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              draft.daysOfWeek.includes(day) ? "bg-primary text-primary-foreground" : ""
            }`}
            aria-pressed={draft.daysOfWeek.includes(day)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberedField label="First seating">
          <Input
            type="time"
            value={draft.startTime}
            onChange={(e) => patch({ startTime: e.target.value })}
            className="h-8"
          />
        </NumberedField>
        {/*
          Named "Last seating", never "Closing time". A merchant who types their
          closing time here will offer a table at the moment the kitchen stops.
        */}
        <NumberedField label="Last seating">
          <Input
            type="time"
            value={draft.endTime}
            onChange={(e) => patch({ endTime: e.target.value })}
            className="h-8"
          />
        </NumberedField>

        <NumberedField label="Minutes between times">
          <select
            value={draft.slotIntervalMin}
            onChange={(e) => patch({ slotIntervalMin: Number(e.target.value) })}
            className="h-8 w-full rounded-md border px-2 text-sm"
          >
            {SLOT_INTERVALS.map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </NumberedField>

        <NumberedField label="How long a table is held">
          <Input
            type="number"
            min={15}
            max={480}
            value={draft.turnTimeMin}
            onChange={(e) => patch({ turnTimeMin: Number(e.target.value) })}
            className="h-8"
          />
        </NumberedField>

        <NumberedField label="Smallest party">
          <Input
            type="number"
            min={1}
            value={draft.minPartySize}
            onChange={(e) => patch({ minPartySize: Number(e.target.value) })}
            className="h-8"
          />
        </NumberedField>

        <NumberedField label="Largest party">
          <Input
            type="number"
            min={1}
            value={draft.maxPartySize}
            onChange={(e) => patch({ maxPartySize: Number(e.target.value) })}
            className="h-8"
          />
        </NumberedField>

        <NumberedField label="Minutes' notice needed">
          <Input
            type="number"
            min={0}
            value={draft.leadTimeMin}
            onChange={(e) => patch({ leadTimeMin: Number(e.target.value) })}
            className="h-8"
          />
        </NumberedField>

        <NumberedField label="Days guests can book ahead">
          <Input
            type="number"
            min={1}
            max={365}
            value={draft.maxAdvanceDays}
            onChange={(e) => patch({ maxAdvanceDays: Number(e.target.value) })}
            className="h-8"
          />
        </NumberedField>

        <NumberedField label="Guests per time slot (optional)">
          <Input
            type="number"
            min={1}
            value={draft.maxCoversPerSlot ?? ""}
            placeholder="Use my floor plan"
            onChange={(e) =>
              patch({ maxCoversPerSlot: e.target.value ? Number(e.target.value) : null })
            }
            className="h-8"
          />
        </NumberedField>
      </div>

      {problem && <p className="text-xs text-destructive">{problem}</p>}

      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled || Boolean(problem)} onClick={() => onSave(draft)}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(period)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function PolicyEditor({
  location,
  disabled,
  onSave,
}: {
  location: LocationReservationConfig;
  disabled: boolean;
  onSave: (patch: Partial<LocationReservationConfig>) => void;
}) {
  const [policy, setPolicy] = useState(location.bookingPolicy ?? "");
  const [cutoff, setCutoff] = useState(location.cancellationCutoffMin);
  const [phone, setPhone] = useState(location.largePartyPhone ?? "");
  const [emails, setEmails] = useState(location.notifyEmails.join(", "));

  const dirty =
    policy !== (location.bookingPolicy ?? "") ||
    cutoff !== location.cancellationCutoffMin ||
    phone !== (location.largePartyPhone ?? "") ||
    emails !== location.notifyEmails.join(", ");

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Booking details
      </h3>

      <NumberedField label="Cancellation policy guests agree to">
        <textarea
          rows={3}
          value={policy}
          onChange={(e) => setPolicy(e.target.value)}
          className="w-full rounded-md border p-2 text-sm"
          placeholder="Please let us know at least two hours ahead if your plans change."
        />
      </NumberedField>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberedField label="Guests can cancel up to (minutes before)">
          <Input
            type="number"
            min={0}
            value={cutoff}
            onChange={(e) => setCutoff(Number(e.target.value))}
            className="h-8"
          />
        </NumberedField>

        {/*
          Shown instead of an empty grid when a party is too large for any
          service. Turns a dead end into a phone call the restaurant wants.
        */}
        <NumberedField label="Phone for large parties">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="h-8"
          />
        </NumberedField>
      </div>

      <NumberedField label="Email new bookings to">
        <Input
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="host@example.com, manager@example.com"
          className="h-8"
        />
      </NumberedField>

      {dirty && (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            onSave({
              bookingPolicy: policy,
              cancellationCutoffMin: cutoff,
              largePartyPhone: phone,
              notifyEmails: emails
                .split(",")
                .map((e) => e.trim())
                .filter(Boolean),
            })
          }
        >
          Save booking details
        </Button>
      )}
    </div>
  );
}

function NumberedField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
