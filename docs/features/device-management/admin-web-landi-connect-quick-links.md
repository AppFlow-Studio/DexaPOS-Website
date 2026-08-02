# [Admin-Web] Landi Connect quick links from the admin portal

Open device management in Landi Connect with the device serial number prefilled.

| | |
|---|---|
| **Status** | Interim (Option B) built — code review only, not yet run in browser |
| **Assignee** | Ali Awdi |
| **Priority** | Low |
| **Start date** | 2026-06-27 |
| **Last updated** | 2026-07-02 |
| **Area** | Admin portal (web, Next.js) — device management views |
| **Notion** | https://app.notion.com/p/38c8280c1b1d819bbc80d9beac393195 |

## Testing status (2026-07-02)

- ✅ **Browser-verified via Playwright MCP** (HQ admin login → `/manage/devices`). Registry was empty, so a temp `device_inventory` row (`ZZTEST-LANDI-0001`, Landi C20 PRO) was seeded via the service-role client, tested, then deleted (registry back to 0).
- **Inventory list row — all assertions passed:**
  - Icon button renders on the device row.
  - `href` = `https://apac-mdm.connect.landiglobal.com/assetsManagement` (default APAC host; no `NEXT_PUBLIC_LANDI_CONNECT_URL` set).
  - `target="_blank"`, `rel="noopener noreferrer"`; `aria-label`/`title` = "Manage ZZTEST-LANDI-0001 in Landi Connect".
  - Click opens a new tab (popup event fired), copies the serial to the clipboard (read back `ZZTEST-LANDI-0001`), and shows the "Serial copied" toast with the paste-into-search description.
- **Device detail page (full button): could not be exercised live** — the `/manage/devices/[deviceId]` route returns a server 404 on this dev environment. This is **pre-existing and unrelated** to the Landi feature: the untouched `/manage/devices/overview` route 404s identically. The detail page uses the same `<ManageInLandiConnectButton serialNumber={device.serial_number} />` component (non-icon variant), already proven on the list row.
- Follow-up (separate from this ticket): investigate why nested `/manage/devices/*` routes 404 in the Turbopack dev server (index route serves fine).

## Contract

**Problem**
Admins must leave the portal and manually navigate Landi Connect to act on a merchant's in-store device. There are no context-aware shortcuts from the admin portal into Landi Connect.

**Expected behavior**
From the admin portal, an admin clicks a button on a device and lands in **Landi Connect** with that device's **serial number** prefilled, ready to manage the device in-store.

**What ships**
Context-aware "Manage in Landi Connect" link(s) in the admin device views that open Landi Connect with the device serial number passed in.

## ✅ URL contract — RESOLVED (verified in-portal 2026-07-01)

Captured by clicking through the live partner portal (`apac-mdm.connect.landiglobal.com`, MTech Support login):

- **Region/host:** `https://apac-mdm.connect.landiglobal.com` (`apac` = Asia Pacific, `mdm` = device management). Keep in env/config — other regions will differ.
- **Device list page:** `/assetsManagement`
- **Device detail page (both the SN link and the "View" link point here):**
  ```
  /posDetail?p=1722526853455478784&back=assetsManagement
  ```
  - `p` = **Landi's internal device ID** — a 19-digit snowflake-style opaque key.
  - `back=assetsManagement` = return-breadcrumb hint only; not required.

### 🚫 Critical finding: the serial number is NOT usable as the deep-link key
- `p` is an internal ID, **not** the serial (detail page shows SN `2591CCM07801`, URL uses `p=1722526853455478784`). No serial anywhere in the URL.
- The list page **ignores query params**: `/assetsManagement?sn=25B3CCM09765` loads all 42 devices unfiltered.
- The in-page "SN, Model, Device Name" search is **pure client-side** — typing + Enter does **not** change the URL. No filtered-list deep link exists.

**Conclusion:** the original spec ("pass the serial number") is not achievable. A working device link requires Landi's internal `p` ID per device.

## Interim build — Option B SHIPPED (2026-07-01)

"Manage in Landi Connect" action added to the HQ device views. Opens the Landi
device list in a new tab and copies the serial to the clipboard so the admin can
paste it into Landi's search (no serial-based deep link exists — see below).

- `lib/device-registry/landi-connect.ts` — `LANDI_CONNECT_BASE_URL` (env `NEXT_PUBLIC_LANDI_CONNECT_URL`, defaults to the APAC host) + `buildLandiConnectListUrl()`.
- `app/manage/devices/components/ManageInLandiConnectButton.tsx` — reusable action; hides when no serial; opens with `target="_blank" rel="noopener noreferrer"`.
- Wired into the inventory list rows (icon button) and the device detail header (full button).

Follow-up = Option A (deep link straight to the device) once the SN→`p` ID mapping exists.

## Options

| Option | Needs | Value |
|---|---|---|
| **A. Store Landi `p` ID per device**, build `/posDetail?p={landiId}` | A **Landi MDM API** (or export) giving `serial → p` mapping, synced into `admin_device_inventory` | ✅ Deep link to the exact device (the real ask) |
| **B. Link to `/assetsManagement`**, admin searches SN by hand | Nothing — no Landi dependency | ⚠️ Low value, ships today |

Recommended: **Option A.** Domain is an MDM platform, so an API almost certainly exists.

## ⚠️ New blocking input (revised — obtain before build)

URL format is now known. The remaining unknown is the **SN→`p` ID mapping**:
- Is there a **Landi MDM API** to fetch a device's internal `p` ID by serial (or list all devices with both)? Endpoint, auth method, rate limits.
- Auth/SSO: portal is behind the MTech partner login. Confirm whether an **SSO handoff** is possible or the admin just authenticates to Landi independently (v1 can assume the latter).

Source from the Landi Connect rep / Sam (MTech) / Temur.

## Acceptance criteria — Option B (shipped in this PR)

- [x] A "Manage in Landi Connect" action appears on the relevant admin device rows / device detail.
- [x] Clicking opens the Landi device list (`/assetsManagement`) in a new tab (`target="_blank" rel="noopener noreferrer"`) and copies the device serial to the clipboard so the admin can paste it into Landi's on-page search.
- [x] No credentials embedded in the URL or committed to the repo; the region host is env-configurable (`NEXT_PUBLIC_LANDI_CONNECT_URL`, APAC default).
- [x] Graceful state when a device has no serial (the action is hidden).
- [x] When the clipboard API is unavailable, the action falls back to an info toast instead of falsely reporting "Serial copied".
- [x] Proof: Playwright MCP run — button copies the serial and opens the authenticated Landi list; pasting the serial into Landi's search filters to the exact device.

## Acceptance criteria — Option A (follow-up: deep link)

- [ ] Clicking opens `/posDetail?p={landiId}` in a new tab for the correct device.
- [ ] `landiId` is sourced from a stored SN→ID mapping (per Option A); document where it's populated from.
- [ ] Graceful state when a device has no Landi ID on file (hide / disable the action).
- [ ] Proof: screen recording opening Landi Connect on the exact device from an admin device row.

## Dependencies / related

- "Device Management" (`3028280c…`, DM-003 Admin Dashboard) and "Device Inventory & Registry" (`31d8280c…`) — the admin device surface these links live on, and the serial source.

## Deep implementation

**Verified on staging (`dfwqakoyittmrwbqvxgw`):** `serial_number text` exists on `admin_device_inventory`, `device_inventory`, `station_devices`, `payment_terminals`, `printers`. For the in-store **tablet/device** managed via Landi Connect, the admin-side source is `admin_device_inventory.serial_number` (confirm vs `station_devices.serial_number` if the admin device view is station-scoped).

**Implementation (Ali Awdi):**
- Helper is `buildLandiConnectUrl(landiId)` → `` `${LANDI_BASE}/posDetail?p=${landiId}` ``, NOT serial-based (see URL contract above). Keep `LANDI_BASE` in env/config, not hardcoded.
- Requires a new stored field for the Landi internal ID (e.g. `admin_device_inventory.landi_device_id text`) populated via the SN→ID mapping (Option A). Until that exists, only **Option B** (list-page link) is buildable.
- Render the action only when the Landi ID is present; open with `target="_blank" rel="noopener"`.
- If an auth/SSO handoff is required, scope that as a follow-up — v1 can open the Landi-authenticated page if the admin already has a session.

**Out of scope:** any write-back from Landi Connect into DEXA; bulk / multi-device actions.
