/**
 * The two addresses reservations own on a merchant's site.
 *
 * One module because three different layers need to agree about them and they
 * cannot see each other's constants: the provisioner
 * (`app/dashboard/website/actions/reservations-page.ts`) creates the page, the
 * header links to it, and `reserved-paths.ts` decides which of the two a
 * merchant may claim for a page of their own.
 *
 * It could not live in the provisioner, which is a `"use server"` module — such
 * a module may export async functions and nothing else, constants included, or
 * Turbopack fails the build compiling its exports into the server-action
 * manifest. `tsc` and the whole test suite pass on that mistake; only
 * `npm run build` catches it.
 */

/**
 * Where `SyncReservationsPage` puts the auto-created booking page.
 *
 * Deliberately NOT reserved in `reserved-paths.ts`: this path belongs to the
 * merchant. They may rename the page, delete it, or build their own there, and
 * the provisioner adopts an existing page at this path rather than fighting it.
 */
export const RESERVATIONS_PAGE_PATH = "reservations";

/**
 * The guest manage route's segment — `/{r}/{token}`, served by
 * `app/sites/[slug]/r/[token]`.
 *
 * A single short segment rather than `reservations/{token}`, because a static
 * route beats the `[...path]` catch-all in Next: nesting it under the merchant's
 * own page would shadow every sub-page they later created there. This one IS
 * reserved.
 */
export const RESERVATION_MANAGE_SEGMENT = "r";

/** The guest's manage page, relative to a site's base path. */
export function reservationManagePath(basePath: string, manageToken: string): string {
  return `${basePath}/${RESERVATION_MANAGE_SEGMENT}/${manageToken}`;
}

/** The merchant's booking page, relative to a site's base path. */
export function reservationsPagePath(basePath: string): string {
  return `${basePath}/${RESERVATIONS_PAGE_PATH}`;
}
