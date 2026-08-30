"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  isSelectable,
  monthGrid,
  monthHasSelectableDay,
  shiftMonth,
  shortDate,
  WEEKDAY_INITIALS,
} from "@/lib/site-builder/reservations/calendar";
import {
  AVAILABILITY_PATH,
  HOLD_PATH,
  HONEYPOT_FIELD,
  RENDERED_AT_FIELD,
  type AvailabilitySlot,
  type BookableLocation,
  type BookResponse,
} from "@/lib/site-builder/reservations/protocol";
import {
  availableHours,
  filterSlotsNearHour,
  groupSlotsByService,
  prettyHour,
} from "@/lib/site-builder/reservations/slot-view";

/**
 * The booking widget: pick a party size, a date and a time, then four fields.
 *
 * **The only client component in the feature.** Its parent section, like every
 * other section, is a server component — see the note there.
 *
 * Two screens, no wizard. That structure is lifted directly from the SevenRooms
 * teardown (docs/research/sevenrooms-reservations/TEARDOWN.md) and it is the
 * single most important thing about this design: a guest goes from landing to
 * booked in two clicks and one short form. Every layout decision below serves
 * that — the pre-filled defaults, the absent search button, the grid of large
 * solid buttons, the collapsed optional fields.
 *
 * The checkout step is deliberately NOT a route. This section can sit anywhere
 * on any page, so navigating away to book would discard the page around it.
 */

type Screen = "location" | "search" | "checkout" | "done";

interface Props {
  siteId: string;
  /**
   * The branch to book, when the page already settled one. Null means ask —
   * which only happens on a brand page for a merchant with more than one
   * bookable branch.
   */
  locationId: string | null;
  /**
   * The branches this widget may offer, with each one's booking settings.
   *
   * Optional so a caller that predates the picker still type-checks; an absent
   * or empty list simply means no branch metadata, and the widget falls back to
   * the bounds it always used.
   */
  locations?: BookableLocation[];
  /**
   * Whether the merchant runs more than one bookable branch.
   *
   * Sent separately because `locations.length` cannot answer it: once a pinned
   * section or a branch page has settled a branch, the list holds one entry
   * whether the merchant runs one restaurant or nine. That is exactly the case
   * where naming the branch matters most — the guest was never asked — so the
   * widget names the restaurant on this flag, not on the list length.
   */
  multiBranch?: boolean;
  /**
   * Whether a submission books a table or asks for one.
   *
   * Needed **before** the guest commits, not after: it changes what the button
   * says and adds a line above it. A guest who discovers on the success screen
   * that nothing is confirmed was misled by the button they pressed.
   *
   * Optional, defaulting to `auto`, so a caller that predates this — the
   * builder's stand-in, an old cached payload — renders today's behaviour
   * rather than telling a guest their table is only a request.
   */
  approvalMode?: "auto" | "manual";
  /** `''` at a brand subdomain, `/sites/{slug}` on the path form. */
  basePath: string;
  /** The restaurant's display name, for the confirmation screen. */
  venueName: string | null;
  showDetails: boolean;
  showOtherDates: boolean;
  /**
   * Always "live". The editor's stand-in is server-rendered by
   * `ReservationsSection` instead, so this component never has an inert mode to
   * reason about — and can never accidentally place a real hold from a canvas.
   */
  renderMode: "live";
}

/**
 * The branch a guest already chose, for as long as this browser session lasts.
 *
 * **`sessionStorage`, not `localStorage`, and deliberately.** The point of the
 * picker is that nothing silently decides which restaurant a guest eats at. A
 * persistent choice would quietly reintroduce exactly that months later, when
 * the guest has long forgotten choosing — so the memory dies with the tab, and a
 * fresh visit asks again.
 *
 * Both directions are wrapped: a private window, blocked site data, or an
 * embedded webview can throw on mere *access*, and a booking widget must not die
 * because storage is unavailable. Forgetting is always safe here; it only ever
 * costs one extra tap.
 */
function branchMemoryKey(siteId: string): string {
  return `dexa-reservation-branch:${siteId}`;
}

function readRememberedBranch(siteId: string): string | null {
  try {
    return window.sessionStorage.getItem(branchMemoryKey(siteId));
  } catch {
    return null;
  }
}

function rememberBranch(siteId: string, locationId: string): void {
  try {
    window.sessionStorage.setItem(branchMemoryKey(siteId), locationId);
  } catch {
    /* Not being able to remember is not a failure worth showing anyone. */
  }
}

/** Today at the *viewer's* clock, which is the right default for picking a date. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** `2026-08-29` → `Sat, Aug 29`. */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** `19:00` → `7:00 PM`. Wall clock at the restaurant, never converted. */
function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export default function ReservationWidget({
  siteId,
  locationId,
  locations,
  multiBranch,
  approvalMode,
  basePath,
  venueName,
  showOtherDates,
}: Props) {
  // Anything that is not exactly "manual" is auto — the same rule the SQL and
  // `resolveReservationApproval` apply, so all three agree about what a guest
  // is promised.
  const manualReview = approvalMode === "manual";
  const branches = useMemo(() => locations ?? [], [locations]);

  /**
   * The branch being booked, in order of authority:
   *
   *  1. the prop, when a pinned section or a branch page already settled one;
   *  2. the only bookable branch, so a single-restaurant merchant is never asked
   *     a question with one answer;
   *  3. what this guest chose earlier in the same session;
   *  4. nothing — ask.
   *
   * **A remembered branch is honoured only if it is still bookable.** A branch
   * that has since switched bookings off, or lost its last service period, must
   * fall through to the picker: silently rerouting a guest to a different
   * restaurant than the one they chose is the very bug this flow exists to
   * remove, and it would arrive through the back door.
   *
   * Safe to read storage during the initialiser: this component is portalled in
   * from an effect, so it never server-renders and there is no hydration pass to
   * mismatch.
   */
  const [branchId, setBranchId] = useState<string | null>(() => {
    if (locationId) return locationId;
    if (branches.length === 1) return branches[0].id;

    const remembered = readRememberedBranch(siteId);
    return remembered && branches.some((l) => l.id === remembered) ? remembered : null;
  });
  const branch = useMemo(
    () => branches.find((l) => l.id === branchId) ?? null,
    [branches, branchId],
  );

  // Follows the branch resolution above rather than recomputing it: if anything
  // settled a branch — a pin, a lone restaurant, or this session's own earlier
  // choice — there is nothing to ask.
  const [screen, setScreen] = useState<Screen>(() => (branchId ? "search" : "location"));
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(todayIso);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  /**
   * Which part of the day the guest wants, or `"all"`.
   *
   * Filtering happens here rather than in the request: availability is already
   * re-queried on every picker change, and narrowing a list we hold costs
   * nothing, keeps the grid instant, and cannot disagree with what the server
   * last said was free.
   */
  const [timeFilter, setTimeFilter] = useState<number | "all">("all");
  /**
   * Which of the pill's three panels is open, if any.
   *
   * Held here rather than inside each `Picker` so that "only one open at a time"
   * is structural — see the note on `Picker.open`.
   */
  const [openPicker, setOpenPicker] = useState<"Guests" | "Date" | "Time" | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * The last query did not produce an answer.
   *
   * Kept apart from `slots.length === 0` because the two mean opposite things:
   * an empty grid the server actually computed is "this date is full", while a
   * refused or failed request is "we do not know". Only the first may say so.
   */
  const [loadFailed, setLoadFailed] = useState(false);

  const [chosen, setChosen] = useState<AvailabilitySlot | null>(null);
  const [holdToken, setHoldToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookResponse | null>(null);

  /** Stamped when checkout is shown, so the timing heuristic has a baseline. */
  const renderedAt = useRef<number>(Date.now());

  /**
   * The party sizes this branch will actually seat, and how far ahead it books.
   *
   * From the branch when it is known, and from the old hardcoded 1–12 / 365 when
   * it is not, so a caller without branch metadata behaves exactly as before.
   */
  const minParty = branch?.minPartySize ?? 1;
  const maxParty = branch?.maxPartySize ?? 12;
  const maxAdvanceDays = branch?.maxAdvanceDays ?? 365;

  /**
   * A party the restaurant cannot seat online.
   *
   * Showing an empty grid here would repeat the section's original sin: telling
   * a guest there is nothing available when nothing was asked. A phone number is
   * the answer, and for a big table it is the answer the restaurant wants anyway.
   */
  const largeParty = partySize > maxParty;
  const largePartyPhone = branch?.largePartyPhone ?? branch?.phone ?? null;

  // A party size outside the branch's range must never reach the API — and the
  // clamp has to follow a branch CHANGE too, since two branches may seat
  // different parties.
  useEffect(() => {
    setPartySize((n) => (n < minParty ? minParty : n));
  }, [minParty]);

  const canQuery = Boolean(branchId) && !largeParty;

  // ── Availability ──────────────────────────────────────────────────────────
  const loadSlots = useCallback(async () => {
    if (!canQuery) return;
    setLoading(true);
    setNotice(null);
    // Cleared alongside the notice: a retry that succeeds must not leave the
    // grid suppressed by the previous attempt's failure.
    setLoadFailed(false);
    try {
      const res = await fetch(AVAILABILITY_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, locationId: branchId, date, partySize }),
      });
      const json = await res.json();

      if (json.ok) {
        setSlots(json.slots);
        setLoadFailed(false);
      } else {
        /*
          A refusal is NOT an empty restaurant.
          `fail()` answers HTTP 200 with `{ ok: false, code }`, so treating any
          non-ok body as "no slots" printed "No tables available for 2 on Mon,
          Aug 31" at a guest whose request was never actually answered — the same
          false zero the phone-number fallback and the large-party message exist
          to prevent, arrived at from a third direction.

          Rate limiting is the one a real guest hits: the grid re-queries on every
          party-size and date change, so someone comparing a few dates can trip it
          and be told the restaurant is full.
        */
        setSlots([]);
        setLoadFailed(true);
        setNotice(
          json.code === "rate_limited"
            ? "You have checked a lot of times just now. Please wait a moment and try again."
            : "We could not load times just now. Please try again.",
        );
      }
    } catch {
      // A network failure is not "no tables" either.
      setSlots([]);
      setLoadFailed(true);
      setNotice("We could not load times just now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [canQuery, siteId, branchId, date, partySize]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  // ── What the grid actually shows ──────────────────────────────────────────
  const hours = useMemo(() => availableHours(slots), [slots]);

  /**
   * A filter the current day cannot honour is simply not applied.
   *
   * Changing the date or the party size reloads the grid, and the hours that
   * come back are rarely the same ones — "7 PM" against a day that stops
   * serving at 3 has to mean something. Resolving it HERE, during render,
   * rather than correcting the state afterwards in an effect, is what keeps the
   * control and the grid from ever disagreeing: an effect would let one render
   * pass through showing an empty grid under a picker still naming 7 PM, and
   * only then fix it. Feeding this back into the `<select>` too means the guest
   * watches the choice return to "All Times" instead of losing it silently.
   */
  const effectiveFilter =
    timeFilter !== "all" && hours.includes(timeFilter) ? timeFilter : "all";

  const visibleSlots = useMemo(
    () => (effectiveFilter === "all" ? slots : filterSlotsNearHour(slots, effectiveFilter)),
    [slots, effectiveFilter],
  );

  /*
    No "narrowed to nothing" state exists, and that is a property of the design
    rather than an omission: every hour offered is an hour that HAS a table, so
    the window around it always contains at least the slot that put it in the
    list. A message for it would be unreachable code claiming to handle a case
    that cannot arise.
  */
  const groups = useMemo(() => groupSlotsByService(visibleSlots), [visibleSlots]);

  // ── The hold countdown ────────────────────────────────────────────────────
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt || screen !== "checkout") return;

    // Derived from the absolute instant the server returned, never from a
    // duration counted locally — otherwise the timer and the hold expire at
    // different moments and the guest is told the wrong thing.
    const tick = () => {
      const left = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setScreen("search");
        setHoldToken(null);
        setExpiresAt(null);
        setChosen(null);
        setNotice("That time was released. Here are the times still available.");
        void loadSlots();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, screen, loadSlots]);

  const countdown = useMemo(() => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [remaining]);

  // ── Choosing a time ───────────────────────────────────────────────────────
  async function chooseSlot(slot: AvailabilitySlot) {
    if (!branchId) return;

    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(HOLD_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, locationId: branchId, date, time: slot.time, partySize }),
      });
      const json = await res.json();

      if (!json.ok) {
        setNotice(
          json.code === "slot_taken"
            ? "Sorry — that time has just gone. Here is what is still available."
            : "We could not hold that time. Please try another.",
        );
        void loadSlots();
        return;
      }

      setChosen(slot);
      setHoldToken(json.token);
      setExpiresAt(json.expiresAt);
      renderedAt.current = Date.now();
      setScreen("checkout");
    } finally {
      setLoading(false);
    }
  }

  /** Back to the grid, releasing nothing explicitly — the hold simply lapses. */
  function backToSearch() {
    setScreen("search");
    setChosen(null);
    setHoldToken(null);
    setExpiresAt(null);
    void loadSlots();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (screen === "location") {
    return (
      <div className="mx-auto max-w-xl">
        <ul className="space-y-3">
          {branches.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => {
                  setBranchId(l.id);
                  // Remembered for this session so opening the header dialog
                  // after choosing on the page does not ask a second time.
                  rememberBranch(siteId, l.id);
                  setScreen("search");
                }}
                className="flex w-full flex-col items-start gap-1 rounded-[var(--site-radius)] border p-4 text-left transition hover:opacity-80"
              >
                <span className="font-semibold">{l.name}</span>
                {l.address && <span className="text-sm opacity-70">{l.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (screen === "checkout" && chosen && holdToken) {
    return (
      <CheckoutView
        siteId={siteId}
        holdToken={holdToken}
        date={date}
        slot={chosen}
        partySize={partySize}
        branch={branch}
        multiBranch={multiBranch === true}
        manualReview={manualReview}
        countdown={countdown}
        renderedAt={renderedAt.current}
        onBack={backToSearch}
        onBooked={(result) => {
          setBooked(result);
          setScreen("done");
        }}
        onExpired={backToSearch}
      />
    );
  }

  if (screen === "done" && booked) {
    return (
      <SuccessView
        booked={booked}
        basePath={basePath}
        /*
          The BRANCH, falling back to the site's name only when no branch is
          resolved. This screen used to say "Joes Coffee Shop" for a table booked
          at Joes Downtown — the brand, not the restaurant — while the
          confirmation message the guest received a moment later named the
          branch correctly. Now the two agree.
        */
        venueName={branch?.name ?? venueName}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/*
        WHICH RESTAURANT. Named on `multiBranch`, not on `branches.length`: a
        pinned section or a branch page narrows the list to one, and that is
        exactly when the guest was never asked and most needs telling. A genuine
        single-restaurant site says nothing, because there is nothing to say.

        `Change` only appears when there is somewhere to change to — a guest on a
        page built about one restaurant should not be offered a way out of it.
      */}
      {multiBranch && branch && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {/*
            Two BLOCKS, not two inline spans separated by a margin.
            `ml-2` is a visual gap and not a textual one, so the accessibility
            tree read "Uptown Branch231123 dakdsf" — the name and the house
            number fused into one word for anyone listening rather than looking.
            Stacking them puts a real boundary in the text content.
          */}
          <div className="min-w-0">
            <div className="text-base font-semibold">{branch.name}</div>
            {branch.address && (
              <div className="text-sm opacity-70">{branch.address}</div>
            )}
          </div>
          {branches.length > 1 && (
            <button
              type="button"
              onClick={() => setScreen("location")}
              className="shrink-0 text-sm underline"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/*
        The search bar: one pill, three segments, no search button.

        **The dividers are the `gap-px` showing the pill's own background
        through.** The pill is painted `--site-border` and each segment is
        painted `--site-card` on top, so the one-pixel gaps read as hairlines
        between them — in a row on a wide screen and between stacked rows on a
        phone, with no `divide-*` utilities and no breakpoint variants to get
        right. Before, those gaps had nothing behind them but the page, so the
        "rules" were whatever colour the section happened to be and vanished
        entirely on a surface that matched.

        `borderColor` is set explicitly, as it should be on everything here: the
        global `* { @apply border-border }` in `globals.css` resolves to the
        DASHBOARD's border colour, so an unstyled border on a merchant's site is
        one of ours rather than one of theirs.
      */}
      <div
        className="mb-6 flex flex-col items-stretch gap-px overflow-hidden rounded-[var(--site-radius)] border sm:flex-row sm:rounded-full"
        style={{ borderColor: "var(--site-border)", background: "var(--site-border)" }}
      >
        <Picker
          label="Guests"
          open={openPicker === "Guests"}
          onOpenChange={(o) => setOpenPicker(o ? "Guests" : null)}
          value={partySizeLabel(partySize, maxParty)}>
          {(close) => (
            <OptionList
              ariaLabel="Number of guests"
              /*
                The branch's own range, not a hardcoded 1–12. One entry PAST the
                maximum is offered on purpose: picking it is how a guest with a
                big party reaches the "call us" message below, instead of
                finding the control simply stops and learning nothing.
              */
              options={Array.from(
                { length: maxParty - minParty + 2 },
                (_, i) => minParty + i,
              ).map((n) => ({ value: String(n), label: partySizeLabel(n, maxParty) }))}
              selected={String(partySize)}
              onPick={(value) => {
                setPartySize(Number(value));
                close();
              }}
            />
          )}
        </Picker>

        <Picker
          label="Date"
          open={openPicker === "Date"}
          onOpenChange={(o) => setOpenPicker(o ? "Date" : null)}
          value={shortDate(date)}>
          {(close) => (
            <CalendarPanel
              value={date}
              min={todayIso()}
              // The branch's real booking window. Past it the restaurant has not
              // opened its books, and the grid would be empty for a reason the
              // guest cannot see.
              max={addDays(todayIso(), maxAdvanceDays)}
              onPick={(day) => {
                setDate(day);
                close();
              }}
            />
          )}
        </Picker>

        {/*
          TIME. This segment used to print `prettyDate(date)` — the same day the
          date input beside it already showed, as static text. Two thirds of the
          pill said Aug 30 and only one of them did anything.

          The options are the hours that actually have a table, not a fixed
          clock. SevenRooms offers every half hour from 6:00 AM at a restaurant
          whose first seating is 12:45 PM, so most of their menu leads nowhere;
          deriving them from the loaded slots means every entry returns
          something, and a lunch-only day offers lunch-only hours with nobody
          configuring that.

          Hidden when there is nothing to narrow: a filter over one hour of
          availability is a control that cannot change the answer.
        */}
        {hours.length > 1 && (
          <Picker
            label="Time"
            open={openPicker === "Time"}
            onOpenChange={(o) => setOpenPicker(o ? "Time" : null)}
            value={effectiveFilter === "all" ? "All Times" : prettyHour(effectiveFilter)}
          >
            {(close) => (
              <OptionList
                ariaLabel="Time of day"
                options={[
                  { value: "all", label: "All Times" },
                  ...hours.map((hour) => ({ value: String(hour), label: prettyHour(hour) })),
                ]}
                selected={String(effectiveFilter)}
                onPick={(value) => {
                  setTimeFilter(value === "all" ? "all" : Number(value));
                  close();
                }}
              />
            )}
          </Picker>
        )}
      </div>

      {notice && (
        <p className="mb-4 rounded-[var(--site-radius)] border p-3 text-center text-sm" role="status">
          {notice}
        </p>
      )}

      {/*
        aria-live so a screen-reader user hears the grid repopulate after a
        picker change. Without it the change is silent and the guest has no way
        to know anything happened.
      */}
      <div aria-live="polite" aria-busy={loading}>
        {largeParty ? (
          /*
            Bigger than this branch seats online. An empty grid here would be the
            same false zero the section's phone fallback exists to prevent — it
            would say "nothing available" about a party nobody was asked about.
          */
          <p className="rounded-[var(--site-radius)] border p-6 text-center text-sm">
            {largePartyPhone
              ? `For parties of ${maxParty + 1} or more, please call us at ${largePartyPhone}.`
              : `For parties of ${maxParty + 1} or more, please contact the restaurant directly.`}
          </p>
        ) : loading && slots.length === 0 ? (
          <p className="py-8 text-center text-sm opacity-70">Finding tables…</p>
        ) : loadFailed ? (
          /*
            Say nothing about availability we do not know. The notice above
            already explains what went wrong; repeating "No tables available"
            here would answer a question the server never got to.
          */
          null
        ) : slots.length === 0 ? (
          <p className="py-8 text-center text-sm opacity-70">
            No tables available for {partySize} on {prettyDate(date)}.
            {showOtherDates ? " Try another date." : ""}
          </p>
        ) : (
          /*
            One block per service, headed by the merchant's own name for it.

            That name used to sit inside every chip as a caption, so a merchant
            with a single service — which is what `DEFAULT_SERVICE_PERIOD` gives
            everyone — had the word "DINNER" stamped down the whole grid, and a
            merchant with two had the boundary marked only by that caption
            quietly changing partway through.

            The heading appears only when there is more than one group. A lone
            "DINNER" bar under a section already titled "Book a table" is noise,
            and the point of grouping is to add a landmark where there is
            something to navigate, not to label the obvious.
          */
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.id}>
                {groups.length > 1 && group.name && (
                  <h4
                    className="mb-3 border-b pb-2 text-[0.7rem] uppercase tracking-wide opacity-60"
                    style={{ borderColor: "var(--site-border)" }}
                  >
                    {group.name}
                  </h4>
                )}
                <ul
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                  // Named so a screen-reader user landing in the second grid
                  // knows which service they are in without hunting for the
                  // heading above it.
                  aria-label={groups.length > 1 && group.name ? group.name : undefined}
                >
                  {group.slots.map((slot) => (
                    <li key={`${slot.servicePeriodId}-${slot.time}`}>
                      <button
                        type="button"
                        onClick={() => void chooseSlot(slot)}
                        disabled={loading}
                        className="flex w-full items-center justify-center rounded-[var(--site-radius)] px-4 py-3 font-semibold text-[var(--site-brand-contrast)] transition disabled:opacity-60"
                        style={{ background: "var(--site-brand)" }}
                      >
                        {prettyTime(slot.time)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The theme a portalled panel has to carry with it.
 *
 * `--site-*` are declared on the storefront's own wrapper, not on `:root`, so a
 * panel portalled to `<body>` renders OUTSIDE the scope that defines them and
 * every token resolves to nothing — a transparent box with the page showing
 * through it, which is exactly what the first cut did. Copying the computed
 * values onto the panel is what makes it a piece of the merchant's site again.
 *
 * Portalling is still right: the pill sets `overflow-hidden` to clip its
 * segments to the rounded ends, so a panel rendered in place would be cut off at
 * the pill's edge.
 */
const PANEL_THEME_VARS = [
  "--site-card",
  "--site-border",
  "--site-text",
  "--site-brand",
  "--site-brand-contrast",
  "--site-radius",
  "--site-font",
] as const;

function readThemeVars(el: Element): Record<string, string> {
  const cs = getComputedStyle(el);
  const vars: Record<string, string> = {};
  for (const name of PANEL_THEME_VARS) vars[name] = cs.getPropertyValue(name);
  return vars;
}

/** `9+ Guests` past the branch's maximum, `2 Guests` inside it. */
function partySizeLabel(n: number, maxParty: number): string {
  const count = n > maxParty ? `${maxParty + 1}+` : String(n);
  return `${count} ${n === 1 ? "Guest" : "Guests"}`;
}

/**
 * One criterion in the search pill: a button that opens a themed panel.
 *
 * **The panel is portalled to `<body>`, not nested in the segment.** The pill
 * sets `overflow-hidden` so its segments clip to the rounded ends, and anything
 * absolutely positioned inside would be cut off at the pill's own edge — the
 * calendar would lose everything below its first row. Portalling also lets a
 * panel be wider than the segment that opened it, which the calendar has to be
 * on a phone.
 *
 * Position is measured from the trigger and refreshed on scroll and resize, so
 * the panel tracks the pill rather than drifting away from it.
 */
function Picker({
  label,
  value,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  value: string;
  /**
   * Owned by the pill, not by each picker.
   *
   * Local state let two panels stand open at once: clicking a second trigger
   * only dismissed the first because `mousedown` happens to fire before
   * `click`, and a keyboard user tabbing to the next trigger and pressing Enter
   * produced neither — so both panels stayed up, overlapping. One value at the
   * parent makes "only one open" true by construction rather than by event
   * ordering.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  // Captured once per opening rather than in `place`, which also runs on every
  // scroll frame and has no business setting state that often.
  const [theme, setTheme] = useState<Record<string, string>>({});
  /*
    Held in a ref so the listener effect below does not depend on it. Callers
    pass an inline arrow, which is a new function every render, and an effect
    depending on it would tear down and re-subscribe its document listeners on
    every single render while the panel is open.
  */
  const onOpenChangeRef = useRef(onOpenChange);
  // Refreshed in an effect rather than assigned during render: writing a ref
  // while rendering is the thing refs are specifically not for, and the effect
  // runs before any event a guest could fire.
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    if (triggerRef.current) setTheme(readThemeVars(triggerRef.current));

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      // The trigger is excluded so its own click can toggle rather than being
      // closed here and immediately reopened.
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onOpenChangeRef.current(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onOpenChangeRef.current(false);
      // Focus goes back where it came from, or a keyboard user is dropped at
      // the top of the document with no idea what they just dismissed.
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const close = useCallback(() => {
    onOpenChangeRef.current(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div className="min-w-32 flex-1" style={{ background: "var(--site-card)" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => onOpenChange(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-5 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[0.7rem] uppercase tracking-wide opacity-60">{label}</span>
          <span className="block truncate text-base font-medium">{value}</span>
        </span>
        {/* `▾`, the same character the site header's nav menu uses, so the two
            controls on a merchant's page agree. */}
        <span aria-hidden className="text-xs opacity-60">
          ▾
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            className="rounded-[var(--site-radius)] border p-1 shadow-lg"
            style={{
              ...(theme as React.CSSProperties),
              position: "fixed",
              top: rect.top,
              left: rect.left,
              minWidth: rect.width,
              zIndex: 60,
              background: "var(--site-card)",
              borderColor: "var(--site-border)",
              color: "var(--site-text)",
              fontFamily: "var(--site-font)",
            }}
          >
            {/*
              eslint-disable-next-line react-hooks/refs -- `close` only reads the
              trigger ref when a guest invokes it, in an event handler; passing
              it to the render prop does not dereference anything during render.
            */}
            {children(close)}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * The list inside a picker.
 *
 * The chosen row is a filled brand pill rather than a tick or a tinted
 * background — the same treatment the time slots get, so "this is the one you
 * picked" looks the same everywhere in the widget.
 */
function OptionList({
  ariaLabel,
  options,
  selected,
  onPick,
}: {
  ariaLabel: string;
  options: { value: string; label: string }[];
  selected: string;
  onPick: (value: string) => void;
}) {
  return (
    <ul
      role="listbox"
      aria-label={ariaLabel}
      // Capped so a branch seating twenty cannot produce a panel taller than
      // the screen; anything longer scrolls inside the panel.
      className="max-h-64 overflow-y-auto"
      style={{ minWidth: "11rem" }}
    >
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <li key={option.value} role="option" aria-selected={isSelected}>
            <button
              type="button"
              onClick={() => onPick(option.value)}
              className="w-full cursor-pointer rounded-full px-4 py-2 text-center text-sm font-medium"
              style={
                isSelected
                  ? { background: "var(--site-brand)", color: "var(--site-brand-contrast)" }
                  : undefined
              }
            >
              {option.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The date panel: one month, stepped with arrows.
 *
 * One month rather than the two SevenRooms shows side by side. Two only pays
 * for itself on a wide screen, and the same panel has to work at 390px where
 * two months either overflow or shrink the tap targets below a thumb — so the
 * arrows carry the whole job at every width.
 *
 * A day outside the branch's booking window is rendered disabled rather than
 * omitted, so the shape of the month stays readable and a guest can see that
 * the restaurant simply is not open that far out.
 */
function CalendarPanel({
  value,
  min,
  max,
  onPick,
}: {
  value: string;
  min: string;
  max: string;
  onPick: (day: string) => void;
}) {
  const [anchor, setAnchor] = useState(value);
  const grid = useMemo(() => monthGrid(anchor), [anchor]);

  const prev = shiftMonth(anchor, -1);
  const next = shiftMonth(anchor, 1);
  const canGoBack = monthHasSelectableDay(prev, min, max);
  const canGoForward = monthHasSelectableDay(next, min, max);

  return (
    <div className="p-2" style={{ minWidth: "17rem" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <StepButton label="Previous month" disabled={!canGoBack} onClick={() => setAnchor(prev)}>
          ‹
        </StepButton>
        <span className="text-sm font-semibold">{grid.label}</span>
        <StepButton label="Next month" disabled={!canGoForward} onClick={() => setAnchor(next)}>
          ›
        </StepButton>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            {WEEKDAY_INITIALS.map((initial, i) => (
              // Index keys: the initials are not unique (two S, two T).
              <th
                key={i}
                scope="col"
                className="pb-1 text-[0.7rem] font-medium uppercase opacity-50"
              >
                {initial}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week, w) => (
            <tr key={w}>
              {week.map((day, d) => (
                <td key={d} className="p-0.5 text-center">
                  {day && (
                    <button
                      type="button"
                      disabled={!isSelectable(day, min, max)}
                      onClick={() => onPick(day)}
                      aria-current={day === value ? "date" : undefined}
                      aria-label={shortDate(day)}
                      className="h-9 w-9 cursor-pointer rounded-full text-sm disabled:cursor-default disabled:opacity-30"
                      style={
                        day === value
                          ? {
                              background: "var(--site-brand)",
                              color: "var(--site-brand-contrast)",
                              fontWeight: 600,
                            }
                          : undefined
                      }
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border text-base disabled:cursor-default disabled:opacity-30"
      style={{ borderColor: "var(--site-border)" }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CheckoutView({
  siteId,
  holdToken,
  date,
  slot,
  partySize,
  branch,
  multiBranch,
  manualReview,
  countdown,
  renderedAt,
  onBack,
  onBooked,
  onExpired,
}: {
  siteId: string;
  holdToken: string;
  date: string;
  slot: AvailabilitySlot;
  partySize: number;
  /** Null only for a caller with no branch metadata; the form then omits both. */
  branch: BookableLocation | null;
  /** Whether to name the restaurant in the sticky bar — see the Props note. */
  multiBranch: boolean;
  /** Whether this restaurant answers each booking itself. Changes the button. */
  manualReview: boolean;
  countdown: string;
  renderedAt: number;
  onBack: () => void;
  onBooked: (result: BookResponse) => void;
  onExpired: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});
    setNotice(null);

    try {
      const res = await fetch("/api/site-reservations/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          holdToken,
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          specialRequests: form.get("specialRequests"),
          smsOptIn: form.get("smsOptIn") === "on",
          marketingOptIn: form.get("marketingOptIn") === "on",
          // Sent so the server can refuse a booking that skipped the policy.
          // The checkbox is `required`, but a client-only gate is not a consent
          // record — anyone can POST the endpoint directly.
          policyAccepted: form.get("policyAccepted") === "on",
          [HONEYPOT_FIELD]: form.get(HONEYPOT_FIELD),
          [RENDERED_AT_FIELD]: renderedAt,
        }),
      });
      const json = await res.json();

      if (json.ok) {
        onBooked(json as BookResponse);
        return;
      }
      if (json.code === "invalid" && json.fields) {
        setErrors(json.fields);
        return;
      }
      if (json.code === "hold_expired" || json.code === "slot_taken") {
        onExpired();
        return;
      }
      setNotice("We could not complete your booking. Please try again.");
    } catch {
      setNotice("We could not complete your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      {/*
        The sticky context bar. It exists so the guest never has to scroll back
        or remember what they picked — and the countdown is the honest signal
        that the table really is theirs while they type.
      */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--site-radius)] border px-4 py-3">
        <button type="button" onClick={onBack} className="text-sm underline">
          ‹ Back
        </button>
        {/*
          The branch leads, because this is the last screen before the guest
          commits and it used to name the date, the time and the party size —
          everything except which restaurant they were booking.
        */}
        <span className="text-sm">
          {multiBranch && branch ? `${branch.name} · ` : ""}
          {prettyDate(date)} · {prettyTime(slot.time)} ·{" "}
          {partySize} {partySize === 1 ? "guest" : "guests"}
        </span>
        <span className="text-sm tabular-nums" aria-label="Time remaining to complete booking">
          ⏱ {countdown}
        </span>
      </div>

      {notice && (
        <p className="mb-4 rounded-[var(--site-radius)] border p-3 text-sm" role="alert">
          {notice}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="firstName" label="First name" error={errors.firstName} required />
          <Field name="lastName" label="Last name" error={errors.lastName} required />
        </div>
        <Field name="email" label="Email address" type="email" error={errors.email} required />
        <Field name="phone" label="Phone number" type="tel" error={errors.phone} required />

        <label className="block">
          <span className="mb-1 block text-sm">Anything else we should know?</span>
          <textarea
            name="specialRequests"
            rows={3}
            className="w-full rounded-[var(--site-radius)] border p-3"
          />
        </label>

        {/*
          The booking policy, agreed to rather than merely displayed.
          Required and UNCHECKED: a pre-ticked box is not consent, and this is
          the term the restaurant will hold the guest to if they do not turn up.
          `required` on the input is what blocks submit — the browser's own
          validation, so it works before any of our JavaScript runs.
        */}
        {branch?.bookingPolicy && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="policyAccepted" required className="mt-1" />
            <span>{branch.bookingPolicy}</span>
          </label>
        )}

        {/* Transactional messaging opt-out, marketing opt-in. */}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="smsOptIn" defaultChecked className="mt-1" />
          <span>Text me reminders and confirmations about this reservation.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="marketingOptIn" className="mt-1" />
          <span>Send me news and offers.</span>
        </label>

        {/* The honeypot: hidden from people, irresistible to bots. */}
        <input
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-px w-px opacity-0"
        />

        {/*
          Said BEFORE the button, not after the submit.

          "Hold" is literally true: `reservation_occupancy` counts a pending
          booking as occupying its table, so nobody else can take it while the
          restaurant decides. Saying so is what stops a guest assuming the worst
          about a request — and it is the difference between a request that
          feels like a queue and one that feels like a maybe.
        */}
        {manualReview && (
          <p className="text-sm opacity-70">
            {/*
              Explicit {" "}: a bare space between an expression and the text
              that follows does not survive the JSX text-node join, and the
              branch name rendered welded to the next word — "Uptown
              Branchconfirms each booking". Caught in browser QA, 2026-08-30.
            */}
            {branch?.name ?? "This restaurant"}{" "}
            confirms each booking. We&rsquo;ll hold your table while they do, and let you know
            as soon as they answer.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full px-6 py-3 font-semibold text-[var(--site-brand-contrast)] disabled:opacity-60"
          style={{ background: "var(--site-brand)" }}
        >
          {manualReview
            ? submitting
              ? "Sending…"
              : "Request a table"
            : submitting
              ? "Booking…"
              : "Complete reservation"}
        </button>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  error,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        className="w-full rounded-[var(--site-radius)] border p-3"
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a guest sees the instant the booking lands.
 *
 * Three jobs, in order of how much they matter. It confirms — with the
 * confirmation number, because that is the thing a guest reads out at the door.
 * It repeats the four facts, so nobody has to trust their memory of what they
 * clicked. And it hands over the manage link, which is the only moment the
 * guest is guaranteed to see it: the confirmation email may be delayed, filed
 * as spam, or sent to an address with a typo in it.
 *
 * The link is built from `basePath`, not from an absolute origin. A guest on
 * `joes.dexaposai.com` gets `/r/{token}`; one on `/sites/joes` gets
 * `/sites/joes/r/{token}`. Hardcoding either would break the other, and the
 * path form is what every preview and every local development site uses.
 */
function SuccessView({
  booked,
  basePath,
  venueName,
}: {
  booked: BookResponse;
  basePath: string;
  venueName: string | null;
}) {
  const manageHref = `${basePath}/r/${booked.manageToken}`;

  /*
    Branch on the STORED status, never on the approval mode the page was
    rendered with. A merchant can switch modes between this page loading and
    this guest submitting, and only the row knows which side of that change the
    booking landed on.

    The pending variant changes the eyebrow, the headline AND the promise. A
    single swapped word would leave a screen that still reads as a confirmation
    to anyone skimming it, which is exactly the guest who most needs to know
    that nothing is confirmed.
  */
  const pending = booked.status === "pending";

  return (
    <div className="mx-auto max-w-lg text-center" role="status" aria-live="polite">
      <div className="rounded-[var(--site-radius)] border p-8">
        <p className="text-xs uppercase tracking-[0.14em] opacity-60">
          {pending
            ? booked.alreadyBooked
              ? "Request already sent"
              : "Request sent"
            : booked.alreadyBooked
              ? "Already confirmed"
              : "Confirmed"}
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
          {pending
            ? venueName
              ? `We've asked ${venueName} for a table`
              : "We've asked for your table"
            : venueName
              ? `Your table at ${venueName}`
              : "Your table is booked"}
        </h3>

        {pending && (
          <p className="mt-3 text-sm font-medium">Nothing is confirmed yet.</p>
        )}

        <p className="mt-4 text-lg font-medium">
          {prettyDate(booked.date)} · {prettyTime(booked.time)}
        </p>
        <p className="mt-1 text-sm opacity-70">
          {booked.partySize} {booked.partySize === 1 ? "guest" : "guests"}
        </p>

        <p className="mt-4 text-sm tabular-nums opacity-70">
          Confirmation #{booked.confirmationNumber}
        </p>

        <p className="mt-6 text-sm opacity-70">
          {pending
            ? "The restaurant will answer shortly. We'll text and email you either way."
            : "We have sent the details to your email and phone."}
        </p>

        {/*
          Not a fetch and not a router push — a plain link. This page may be one
          section on a long marketing page, and replacing the whole document is
          exactly what a guest following it expects.
        */}
        <a
          href={manageHref}
          className="mt-5 inline-block rounded-full px-6 py-3 font-semibold text-[var(--site-brand-contrast)]"
          style={{ background: "var(--site-brand)" }}
        >
          {pending ? "View or withdraw your request" : "View or cancel your reservation"}
        </a>
      </div>
    </div>
  );
}
