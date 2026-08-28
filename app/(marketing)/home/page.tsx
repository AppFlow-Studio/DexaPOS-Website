/**
 * /home — the marketing homepage at a stable URL.
 *
 * `/` redirects signed-in merchants to /dashboard (see proxy.ts), which makes it
 * awkward to review the marketing site while logged in. This route renders the
 * exact same page component and the same CMS content as `/`, so the two never
 * drift — it is an alias, not a copy.
 */
export { generateMetadata, default } from "../page";
