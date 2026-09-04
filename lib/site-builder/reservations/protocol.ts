/**
 * The wire contract between the public booking widget and its route handlers.
 *
 * One module so the client and the four endpoints cannot disagree about a field
 * name or a status string — a mismatch here would not throw, it would silently
 * make the honeypot useless or leave a countdown running against a hold that
 * expired at a different moment.
 *
 * **Unlike the forms protocol, this one is JSON.** A public form is a native
 * `<form method="post">` that must work with no JavaScript, so it redirects.
 * The booking widget is inherently interactive — a grid that repopulates when
 * you change the party size cannot exist without scripting — so its endpoints
 * speak JSON and the widget renders the result in place.
 */

export const AVAILABILITY_PATH = "/api/site-reservations/availability";
export const HOLD_PATH = "/api/site-reservations/hold";
export const BOOK_PATH = "/api/site-reservations/book";
export const CANCEL_PATH = "/api/site-reservations/cancel";

/**
 * The honeypot field name.
 *
 * Deliberately NOT a real autofill category. The old name — `company_website` —
 * was a magnet: the field is off-screen and invisible to a human, so the only
 * thing that can put a value in it is a bot OR a password manager / browser
 * autofill that fills by field name and ignores `autoComplete="off"`. When that
 * happened the server read the filled honeypot as a bot and rejected a real
 * guest with the generic "we could not complete your booking". A neutral name,
 * together with the `data-*-ignore` attributes on the input (see
 * `ReservationWidget`), keeps autofill out while a blanket bot still trips it.
 *
 * Re-declared here rather than imported from `lib/cms/form-security.ts` because
 * that module builds a Supabase client at import time and this one is pulled
 * into a client component. The two honeypots are independent by design.
 */
export const HONEYPOT_FIELD = "reservation_meta";

/** Milliseconds since the checkout form was shown. A soft second signal. */
export const RENDERED_AT_FIELD = "rendered_at";

/**
 * A human takes at least this long to fill in name, email and phone.
 *
 * Lower than the forms module's 2500ms on purpose: by the time a guest reaches
 * checkout they have already picked a party size, a date and a time, so the
 * form itself is four fields and can honestly be completed quickly.
 */
export const MIN_FILL_MS = 1500;

// ─────────────────────────────────────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every failure the guest can be shown.
 *
 * **Deliberately coarse.** The endpoints answer "no such site", "not taking
 * bookings", "that slot just went" and "your hold expired" with the SAME
 * `unavailable` code wherever telling them apart would leak something — a
 * response that distinguishes a wrong site id from a real one is an
 * enumeration oracle for which merchants exist. The codes that ARE distinct
 * exist because the guest can act on them.
 */
export type ReservationErrorCode =
  /** Anything the guest cannot act on, and anything we will not explain. */
  | "unavailable"
  /** The five minutes ran out. The widget re-queries and shows the grid again. */
  | "hold_expired"
  /** Someone else took it first. Same recovery, different words. */
  | "slot_taken"
  /** Missing or malformed fields. The only one that names what to fix. */
  | "invalid"
  /** Too many requests from this address. */
  | "rate_limited"
  /** Past the merchant's cancellation cutoff — call the restaurant instead. */
  | "cutoff_passed";

export interface ReservationErrorResponse {
  ok: false;
  code: ReservationErrorCode;
  /** Field-level messages, only ever set for `invalid`. */
  fields?: Record<string, string>;
}

export interface AvailabilitySlot {
  /** `HH:MM`, the restaurant's wall clock. */
  time: string;
  servicePeriodId: string;
  serviceName: string;
}

export interface AvailabilityResponse {
  ok: true;
  slots: AvailabilitySlot[];
}

export interface HoldResponse {
  ok: true;
  token: string;
  /** ISO timestamp. The countdown is derived from this, never from a duration. */
  expiresAt: string;
  holdMinutes: number;
}

export interface BookResponse {
  ok: true;
  confirmationNumber: string;
  manageToken: string;
  date: string;
  time: string;
  partySize: number;
  /**
   * What was actually stored, straight from `create_public_reservation`.
   *
   * Never inferred from the approval mode the widget was rendered with: a
   * merchant can switch modes between the page loading and the guest
   * submitting, and the row is the only thing that knows which side of that
   * change this booking fell on. Telling a guest "confirmed" over a `pending`
   * row is the failure this field exists to prevent.
   */
  status: "confirmed" | "pending";
  /** True when this was a double submit and the booking already existed. */
  alreadyBooked: boolean;
}

export interface CancelResponse {
  ok: true;
  alreadyCancelled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests?: string;
  occasionTags?: string[];
  dietaryTags?: string[];
  marketingOptIn?: boolean;
  smsOptIn?: boolean;
}

/** `YYYY-MM-DD`. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `HH:MM`, 24-hour. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The 256-bit hex tokens generated by `generate_reservation_manage_token()`. */
export const TOKEN_RE = /^[0-9a-f]{64}$/;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The largest party the widget will even ask about.
 *
 * Not a business rule — the real limit is per service period. This is a sanity
 * bound so a request for a party of two billion cannot reach the database.
 */
export const MAX_REQUESTABLE_PARTY = 100;

/** How far ahead the widget will request, whatever the caller asks for. */
export const MAX_REQUESTABLE_DAYS_AHEAD = 400;

// ─────────────────────────────────────────────────────────────────────────────
// The widget's configuration
// ─────────────────────────────────────────────────────────────────────────────
//
// Loaded server-side by `config.ts` and serialised into the section's
// `data-dexa-reservations` attribute, so the widget's first paint needs no
// configuration round trip. The shapes live HERE, beside the wire contract and
// away from `config.ts`, because that module is `server-only` and this one is
// pulled into a client component — a type import would be erased, but
// `EMPTY_RESERVATIONS_CONFIG` is a runtime value and would drag the service-role
// client into the browser bundle's module graph.

/** One branch a guest may book, with the settings its form is shaped by. */
export interface BookableLocation {
  id: string;
  name: string;
  /** Composed in SQL; `null` when the merchant has entered no address. */
  address: string | null;
  /** IANA zone. The grid is labelled in the BRANCH's zone, never the visitor's. */
  timezone: string;
  phone: string | null;
  /** Shown at checkout as a required, unchecked consent. Null means no policy. */
  bookingPolicy: string | null;
  collectBirthday: boolean;
  /** For the over-max-party message. Falls back to `phone` at the call site. */
  largePartyPhone: string | null;
  cancellationCutoffMin: number;
  /** Widest range across the branch's active service periods — see the SQL. */
  minPartySize: number;
  maxPartySize: number;
  maxAdvanceDays: number;
}

/** What the section serialises for the widget. */
export interface ReservationsConfig {
  locations: BookableLocation[];
  /**
   * Whether a submission is booked or requested — one value for the whole
   * business, so it sits here rather than on each `BookableLocation`.
   *
   * The widget needs it *before* the guest commits: the button says "Request a
   * table" rather than "Complete reservation", and a line above it explains
   * that the restaurant confirms each booking. A guest who only finds that out
   * on the success screen was misled by the button they pressed.
   *
   * Set in `buildPublicRenderContext`, deliberately not in the config RPC —
   * that returns one row per branch, so putting a site-wide value there would
   * duplicate it N times and invite the copies to disagree.
   */
  approvalMode: "auto" | "manual";
}

/**
 * Inert value for the builder, preview, and every site without reservations.
 *
 * `auto` because that is what every site does today, and because a builder
 * canvas showing "Request a table" for a merchant who accepts automatically
 * would be a preview of someone else's website.
 */
export const EMPTY_RESERVATIONS_CONFIG: ReservationsConfig = {
  locations: [],
  approvalMode: "auto",
};
