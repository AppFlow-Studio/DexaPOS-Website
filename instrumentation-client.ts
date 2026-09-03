// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * Performance tracing and session replay are disabled in development.
 *
 * `next.config.ts` sets `tunnelRoute: "/api/ingest"`, so every Sentry event is
 * proxied through the Next server rather than sent straight to Sentry. In
 * production that is the point — it survives ad blockers. In development it
 * means telemetry competes with page renders for the same single-threaded dev
 * server: measured at 294 ingest requests totalling 37 s of dev-server time,
 * and 8 requests during a 12 s idle window with nobody touching the browser.
 *
 * Session replay is the expensive half, and the drag-and-drop builder is its
 * worst case — every drag emits a stream of DOM mutation records.
 *
 * Error capture stays on, so dev still reports real failures. Production
 * behaviour is completely unchanged.
 */
const isDev = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: "https://82d5a5c61852d6bcd0d99c57ce185d0f@o4511212537380864.ingest.us.sentry.io/4511226223460352",

  // Add optional integrations for additional features
  integrations: isDev ? [] : [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: isDev ? 0 : 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

