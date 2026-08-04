/**
 * Landi Connect (partner MDM portal) deep-link config.
 *
 * IMPORTANT: Landi routes device *detail* pages by an internal device id
 * (`/posDetail?p=<landiId>`), NOT by serial number, and the list page ignores
 * query params. So until we have a serial -> landiId mapping (needs a Landi
 * MDM API), we can only link to the device list and let the admin search the
 * serial by hand. This is the interim "Option B".
 *
 * See docs/features/device-management/admin-web-landi-connect-quick-links.md for the full URL contract.
 */

const DEFAULT_LANDI_CONNECT_BASE_URL = 'https://apac-mdm.connect.landiglobal.com'

/** Base URL of the Landi Connect partner portal (region-specific). */
export const LANDI_CONNECT_BASE_URL = (
  process.env.NEXT_PUBLIC_LANDI_CONNECT_URL ?? DEFAULT_LANDI_CONNECT_BASE_URL
).replace(/\/+$/, '')

/** The Device Overview / asset-management list page. */
export function buildLandiConnectListUrl(): string {
  return `${LANDI_CONNECT_BASE_URL}/assetsManagement`
}
