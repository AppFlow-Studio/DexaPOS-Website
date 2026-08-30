import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ReservationManageActions from "@/components/site-builder/reservations/ReservationManageActions";
import { googleFontsHref } from "@/lib/site-builder/fonts";
import {
  DEFAULT_THEME,
  resolveTheme,
  themeToCssVars,
  type ThemeTokens,
} from "@/lib/site-builder/render-context";
import { resolveRenderMode } from "@/lib/site-builder/resolve-render-mode";
import {
  isTerminal,
  loadReservationByToken,
  type ManagedReservation,
} from "@/lib/site-builder/reservations/manage";
import { createAnonSupabaseClient } from "@/lib/supabase/anon";

/**
 * The guest's own page for a booking they made on a merchant's website.
 *
 * **`/r/{token}`, deliberately not `/reservations/{token}`.** The merchant's own
 * booking page lives at `reservations` and is served by the `[...path]`
 * catch-all. A static route beats a catch-all in Next, so `reservations/[token]`
 * would silently shadow every sub-page a merchant later made under it —
 * `reservations/private-dining` would be looked up as a manage token and 404.
 * One reserved segment avoids the entire class of problem, and matches the
 * convention QR dine-in already set with `t`. `reserved-paths.ts` holds the
 * other half of the guarantee: a merchant cannot create a page at `r`.
 *
 * **Without this page, every change is a phone call.** That is not a small
 * thing: when cancelling is harder than not turning up, guests stop cancelling,
 * and a no-show costs the restaurant the whole cover. Decision D6 put this in
 * v1 for that reason — booking without cancelling is half a feature.
 *
 * The page is `force-dynamic` and never cached. A cached manage page would show
 * a guest a cancelled booking as confirmed, which is the one thing it exists to
 * get right.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
}

/**
 * Never indexed, and no booking details in the title.
 *
 * A manage URL is a credential. Search engines must not hold one, and a browser
 * history entry or a shared screenshot should not name the guest.
 *
 * **Status, and only status.** The title tracks the headline because a static
 * "Your reservation" told a guest with an unanswered request that they had one
 * — the same drift the body was fixed for, surviving in the one place a guest
 * scanning tabs actually reads. What it must never gain is a detail: no name,
 * no date, no confirmation number. Everything here is already in the `h1`, so a
 * screenshot reveals nothing the screenshot did not already reveal.
 *
 * The lookup is free: `loadReservationByToken` is `cache`d, so this and the
 * body share one round trip.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const reservation = await loadReservationByToken(token);

  return {
    title: reservation ? manageTitle(reservation.status) : "Your reservation",
    robots: { index: false, follow: false },
  };
}

/** The tab's version of the headline, kept deliberately detail-free. */
function manageTitle(status: string): string {
  if (isTerminal(status)) return statusHeadline(status);
  return status === "pending" ? "Awaiting confirmation" : "Your reservation";
}

export default async function ReservationManagePage({ params }: PageProps) {
  const { slug, token } = await params;

  // The booking first. An unknown token, a malformed one and a database failure
  // all arrive here as null and all become the same 404 — so a token that does
  // not exist is indistinguishable from one that does.
  const reservation = await loadReservationByToken(token);
  if (!reservation) notFound();

  const theme = await loadSiteTheme(slug);
  const fontsHref = googleFontsHref([theme.fontFamily, theme.headingFont]);

  const terminal = isTerminal(reservation.status);
  /**
   * A request the restaurant has not answered yet.
   *
   * Without this the page rendered the neutral "Your reservation" for every
   * non-terminal status — which **reads as confirmed**. A guest who was
   * carefully told on the booking screen that nothing was confirmed would come
   * back to this link an hour later and be told, in effect, that it was. The
   * one page they revisit is the one that must not drift from the truth.
   */
  const awaitingAnswer = reservation.status === "pending";

  return (
    <div
      style={{
        ...themeToCssVars(theme),
        background: "var(--site-surface)",
        color: "var(--site-text)",
        fontFamily: "var(--site-font)",
      }}
      className="site-shell flex min-h-screen w-full flex-col items-center px-4 py-12"
    >
      {fontsHref && <link rel="stylesheet" href={fontsHref} precedence="site-fonts" />}

      <main className="w-full max-w-lg space-y-6">
        <header className="text-center">
          {reservation.location.name && (
            <p className="text-xs uppercase tracking-[0.14em] opacity-60">
              {reservation.location.name}
            </p>
          )}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {terminal
              ? statusHeadline(reservation.status)
              : awaitingAnswer
                ? "Awaiting confirmation"
                : "Your reservation"}
          </h1>
          {awaitingAnswer && (
            <p className="mt-2 text-sm font-medium">Nothing is confirmed yet.</p>
          )}
          {reservation.confirmationNumber && (
            <p className="mt-1 text-sm tabular-nums opacity-70">
              Confirmation #{reservation.confirmationNumber}
            </p>
          )}
        </header>

        <ReservationSummary reservation={reservation} dimmed={terminal} />

        {/*
          The hold is real — `reservation_occupancy` counts a pending booking as
          occupying its table — so saying it is not reassurance, it is the fact
          that stops a guest booking elsewhere as insurance while they wait.
        */}
        {awaitingAnswer && (
          <p className="rounded-[var(--site-radius)] border p-5 text-center text-sm opacity-70">
            {/* Explicit {" "} — see the widget's pre-commit line. */}
            {reservation.location.name ?? "The restaurant"}{" "}
            confirms each booking themselves. Your table is held while they decide, and
            we&rsquo;ll email and text you as soon as they answer.
          </p>
        )}

        {/*
          A terminal booking gets no controls at all — not a disabled button.
          "Already cancelled" is a state to be shown plainly, never an error:
          the guest did what they meant to do, and telling them something went
          wrong would be false.
        */}
        {terminal ? (
          <p className="rounded-[var(--site-radius)] border p-5 text-center text-sm opacity-70">
            {reservation.status === "cancelled"
              ? "This reservation was cancelled. You are welcome to book again any time."
              : "This reservation is closed. You are welcome to book again any time."}
          </p>
        ) : (
          <ReservationManageActions
            token={token}
            canCancel={reservation.canCancel}
            awaitingAnswer={awaitingAnswer}
            venuePhone={reservation.location.phone}
            cutoffMin={reservation.cancellationCutoffMin}
          />
        )}

        {reservation.bookingPolicy && (
          <section className="rounded-[var(--site-radius)] border p-5 text-sm">
            <h2 className="font-medium">Booking policy</h2>
            <p className="mt-1 whitespace-pre-line opacity-70">{reservation.bookingPolicy}</p>
          </section>
        )}

        <VenueFooter reservation={reservation} />
      </main>
    </div>
  );
}

function ReservationSummary({
  reservation,
  dimmed,
}: {
  reservation: ManagedReservation;
  dimmed: boolean;
}) {
  const tags = [...reservation.occasionTags, ...reservation.dietaryTags];

  return (
    <section
      className="rounded-[var(--site-radius)] border p-6"
      style={dimmed ? { opacity: 0.6 } : undefined}
    >
      <dl className="space-y-4">
        <Row label="When" value={`${prettyDate(reservation.reservationDate)} · ${prettyTime(reservation.reservationTime)}`} />
        <Row
          label="Party"
          value={`${reservation.partySize} ${reservation.partySize === 1 ? "guest" : "guests"}`}
        />
        <Row label="Name" value={reservation.partyName} />
        {/*
          Masked, and masked in Postgres rather than here. A manage link may be
          forwarded or read over a shoulder; it should prove "this is your
          booking" without handing over the contact details of whoever made it.
        */}
        {reservation.emailMasked && <Row label="Email" value={reservation.emailMasked} />}
        {reservation.phoneMasked && <Row label="Phone" value={reservation.phoneMasked} />}
        {tags.length > 0 && <Row label="Notes" value={tags.join(", ")} />}
        {reservation.specialRequests && (
          <Row label="Requests" value={reservation.specialRequests} />
        )}
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <dt className="text-xs uppercase tracking-[0.12em] opacity-60">{label}</dt>
      <dd className="text-right text-[0.95rem] font-medium">{value}</dd>
    </div>
  );
}

function VenueFooter({ reservation }: { reservation: ManagedReservation }) {
  const address = [
    reservation.location.addressLine1,
    [reservation.location.city, reservation.location.state].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  if (!address && !reservation.location.phone) return null;

  return (
    <footer className="pt-2 text-center text-sm opacity-60">
      {address && <p>{address}</p>}
      {reservation.location.phone && <p className="mt-1">{reservation.location.phone}</p>}
    </footer>
  );
}

/**
 * The site's own colours and typefaces, so this page does not look like it
 * belongs to a different restaurant than the one the guest just booked.
 *
 * Resolved from the site's *home* page decision rather than from a page of its
 * own, because there is no built page at `/r/{token}` and there should not be —
 * this route is platform-owned. A merchant on the template storefront, or with
 * nothing published, falls back to the platform theme rather than failing: the
 * booking details are the point of the page, and the styling is not worth a 500.
 */
async function loadSiteTheme(slug: string): Promise<ThemeTokens> {
  try {
    const decision = await resolveRenderMode(createAnonSupabaseClient(), slug, "", true);
    if (decision.mode !== "builder") return DEFAULT_THEME;
    return resolveTheme(decision.theme as Partial<ThemeTokens> | null);
  } catch {
    return DEFAULT_THEME;
  }
}

function statusHeadline(status: string): string {
  return status === "cancelled" ? "Reservation cancelled" : "Reservation closed";
}

/** `2026-08-29` → `Saturday, August 29`. Parsed as a plain date, never as UTC. */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** `19:00` → `7:00 PM`. The restaurant's wall clock, never converted. */
function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}
