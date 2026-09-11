# Support Video Attachments — Status as of 2026-09-10

Companion to [FEATURE-2026-09-08-SUPPORT-VIDEO-ATTACHMENTS.md](FEATURE-2026-09-08-SUPPORT-VIDEO-ATTACHMENTS.md).
That document is the design record; this is the running status.

**Project of record: `dfwqakoyittmrwbqvxgw`** (the value of
`NEXT_PUBLIC_SUPABASE_URL` in `.env`). Several older docs in this repo reference
`hifouuofcaytijrkbvcy` as "prod" and warn about duplicate `NEXT_PUBLIC_SUPABASE_URL`
lines — **that warning is stale.** `.env` now has a single line pointing at
`dfwqakoyittmrwbqvxgw`. Verify the project ref before diagnosing anything against
the hosted stack.

---

## 1. Reported bug: `.mp4` upload failed — FIXED

**Symptom:** attaching `WhatsApp Video 2026-08-07 at 7.17.16 PM.mp4` failed with
the client's generic *"Could not authorize the video upload. Please retry."*

**Root cause — from `cdn-upload` runtime logs (six occurrences, 12:38–12:39):**

```
[cdn-upload] Clerk token verification failed
Error: Invalid JWT form. A JWT consists of three parts separated by dots.
  at requireAuthenticatedUser (cdn-upload/index.ts:161)
  reason: "token-invalid"
```

`FileUploadInput` authorized the upload with a bare `getToken({ skipCache: true })`.
That can return a Clerk session ticket which is **not a JWT**, so
`cdn-upload`'s `verifyToken` rejects it before any bytes are sent.

The kiosk CDN uploaders never hit this because they already ask for the
`supabase` JWT template first and keep the bare call as a fallback
(`lib/cdn/use-merchant-cdn-video-upload.ts:63`, `use-merchant-cdn-image-upload.ts:63`).
The support uploader was the only CDN caller missing that.

**Fix** — `components/support/FileUploadInput.tsx`, matching the existing pattern:

```ts
const sessionToken =
  (await getToken({ template: "supabase", skipCache: true }).catch(() => null)) ||
  (await getToken({ skipCache: true }).catch(() => null));
```

**Tests:** the existing CDN test now asserts the templated call; a new test
covers the fallback when no `supabase` template is configured.
`tests/file-upload-input.test.tsx` — **13/13 pass**.

### A diagnosis that was wrong, and why

Before finding this, this document claimed the cause was an undeployed Edge
Function plus an unapplied migration, and recommended deploying both. **That was
wrong** — it was verified against `hifouuofcaytijrkbvcy`, not the project the app
actually uses. On `dfwqakoyittmrwbqvxgw`:

- `cdn-upload` is **v248** and already contains the full support lane
  (`support` category, `GET` prepare endpoint, upload-token issue/verify,
  3 video MIME types, 100 MB ceiling, streamed body).
- `create_hq_support_ticket` **already has** the video validation — migration
  `20260909120000` is applied.

No deployment or migration was needed. Lesson recorded in
`docs/engineering/developer-experience/lessons.md`.

---

## 1b. Second bug: 90 MB video failed with "Network error during upload" — FIXED

**Symptom:** a 90 MB `.webm` (under the cap) failed mid-upload.

**Root cause — expired Clerk token, from the 15:42–15:43 logs:**

```
15:42:15  OPTIONS preflight              200
15:42:29  session JWT expires            (14s after preflight)
15:42:36  GET prepare  -> 401 token-expired  (7s past expiry)
15:43:09  POST upload  -> 502            (no function boot, no error log)
```

The `POST` never reached the function — no boot event, no error log, so the
**502 came from the Supabase gateway**, not from our code. A gateway-generated
response carries no CORS headers, so the browser could not read it and fired
`xhr.onerror`, which reported a generic network failure instead of the real
status.

The design assumed `skipCache: true` guarantees a fresh token. It does not.
Clerk session tokens live 60 seconds, and the **default leeway allows a cached
token to be handed out with almost no life left** — here one that expired 7
seconds before it was used.

**Fix** (`components/support/FileUploadInput.tsx`):

```ts
const tokenOptions = { skipCache: true, leewayInSeconds: 0 } as const;
```

`leewayInSeconds: 0` forces a genuinely fresh 60-second token for the
authorization round-trip. Both the templated call and the bare fallback use it.

The `onerror` message was also reworded — it previously said "Network error
during upload", which implied a connection problem when the transfer itself was
fine. **Note:** that older wording is what the 90 MB attempt showed, meaning it
ran against a build predating the current code. Confirm the running build before
reproducing.

### Why `onload` did not report the 502

`xhr.onload` already parses non-2xx responses and surfaces the real status and
the function's JSON `error`. It never ran, because the browser blocked an
opaque cross-origin failure. Any gateway-level failure will always surface as
the generic `onerror` message — the precise status is only visible in the
`cdn-upload` logs.

---

## 2. Still open

### 2.1 `add_ticket_message_with_attachments` performs no validation

Confirmed against the live database: the function inserts `file_name`,
`file_path`, `file_size`, `file_type` straight through with **no type, size, or
path checks**. Every reply-with-attachment on both the merchant and HQ paths
goes through it.

This is the server-side validation gap first flagged on 2026-09-08. It is the
intended scope of the Codex task; scope it against
`lib/support/attachment-validation.ts` as it stands today, not the original
description.

### 2.2 `create_support_ticket` (merchant new ticket) has no video validation

| RPC | Validates attachments? | Accepts video? |
|---|---|---|
| `create_hq_support_ticket` | type, size, path | Yes |
| `create_support_ticket` | no size/type gate | Not patched |
| `add_ticket_message_with_attachments` | none | Unvalidated |

A merchant attaching a video to a **new** ticket has not been tested end-to-end.

### 2.3 Video path regex is organization-only

`20260909120000` validates video URLs against:

```
^https://[^/?#]+/organizations/[^/?#]+/support/[^/?#]+$
```

`lib/support/cdn.ts` can also build `merchants/{merchantId}/support/...`.
HQ tickets are organization-scope so the HQ path is unaffected, but a
merchant-scope video reaching this RPC would be rejected.

### 2.4 The 100 MB cap is the spec — not a defect

A 310 MB screen recording was rejected with
`310.4MB exceeds the 100MB limit.` **This is correct behaviour**, and is the
acceptance criterion "a 120 MB file is rejected client-side before any bytes are
sent, with the message naming the 100 MB cap" working as written.

Do not raise the cap to accommodate large files. Verified boundary handling —
all five enforcement layers compare with `>` (or an inclusive max), so exactly
104,857,600 bytes uploads and one byte more is refused:

| Layer | Check |
|---|---|
| `FileUploadInput` client | `file.size > maxSizeMb * 1024 * 1024` |
| `cdn-upload` declared length | `declaredLength > maxSize` |
| `cdn-upload` streamed bytes | `receivedBytes > maxSize` |
| `attachment-validation.ts` | `z.number().max(SUPPORT_ATTACHMENT_MAX_BYTES)` (inclusive) |
| `create_hq_support_ticket` | `v_file_size > 104857600` |

Both sides of the boundary are now covered by tests: 120 MB rejects with no
bytes sent, and exactly 100 MB uploads successfully.

**If the cap ever does need raising**, note the real constraint — `cdn-upload`
holds a 120-second Bunny transfer timeout, so anything much beyond 100 MB fails
mid-transfer on connections under roughly 50 Mbps upload. Bunny Storage has no
scoped write credential (its `AccessKey` is zone-wide read/write/delete), so
direct browser-to-Storage upload is not safely possible. The proper route would
be Bunny Stream's presigned TUS uploads — a separate product with its own
libraries and playback path, and its own project rather than a cap change.

### 2.5 Bunny cleanup 404s

Several `[cdn-upload] Bunny delete failed 404 Object Not Found` entries appear
in the logs. Expected when cleanup runs for an object that was never created
(cancelled or failed before any bytes landed) — noted as benign, not
investigated.

---

## 2b. QA acceptance criteria — status 2026-09-11

**Passing (8).** Two are backed by real production uploads, not just tests:

| Criterion | Evidence |
|---|---|
| 4 MB `.mp4` uploads | Real: 2.4 MB `.mp4`, 2026-09-10 15:13 |
| 80 MB `.mp4` uploads and appears in thread | Real: 88.6 MB `.webm`, 15:57, after the token fix |
| iOS `.mov` as `application/octet-stream` | Test — derives `video/quicktime`, sends explicit `contentType` |
| 120 MB rejected client-side naming the cap | Test — no bytes sent |
| `.exe` rejected naming accepted types | Test |
| Progress visible; cancel leaves no row or object | Test |
| Images/PDF unaffected | Test — 5 MB path intact |
| 3-attachment limit and counter | Single constant drives picker, dropzone, drag-drop, copy |

**Obsolete (2).** Written when video was going to Supabase Storage. Video now
goes to Bunny, so the bucket correctly still reads images/PDF at 5 MB and no
project-level Supabase limit is in the video path. Strike both:

- ~~Bucket lists video MIME types and `file_size_limit = 104857600`~~
- ~~Project global file size limit ≥ 100 MB~~

**Now covered by `tests/support-attachment-proxy.test.ts` (21 tests).** The
proxy had no test file at all; it is the only read path for attachments, so it
is where tenant isolation and seeking are enforced:

- Cross-tenant merchant gets **403**, with no audit row written
- Owning merchant, HQ admin, and owning carrier each get **200**
- Carrier refused when the ticket has no `carrier_id`
- Ranged request returns **206** with correct `Content-Range`; unsatisfiable
  range returns **416** with the real size; malformed range serves the full
  object; upstream ignoring Range falls back to **200** rather than falsely
  claiming 206
- CDN URL rejected on an unexpected host, outside the owner's prefix, or when a
  non-video claims CDN storage
- Audit logs the opener only — continuation ranges are not logged, so seeking
  cannot flood `audit_logs`

Bunny Range support was also confirmed directly against the real uploaded
object: `206 Partial Content`, `Content-Range: bytes 0-1023/2545397`.

**Partially met (1) — network interruption recovery.** Automatic retry is now
implemented; true byte-offset resume is not possible on the current storage.

`OPTIONS https://storage.bunnycdn.com/` returns
`Allow-Methods: GET, DELETE, POST, PUT, DESCRIBE` — **no `PATCH`, no
`Tus-Resumable`**. Bunny Storage exposes no resumable protocol; resumable
uploads are a Bunny *Stream* feature, a different product. So offset resume
would require migrating support video to Stream (new library, presigned TUS
signatures, a different playback path, and reworking the Range proxy).

What ships instead: up to 3 attempts with 1s/2s backoff on transport-level
failures only. The chip shows "Reconnecting…" so a recovering upload is not
mistaken for a frozen one. HTTP error statuses are **not** retried — a rejected
type, an oversize file, or an expired token is a decision the server already
made and would repeat.

Safe by construction: the upload token is valid 15 minutes and bound to the
exact file, so it survives retries; the storage path is deterministic, so a
retry overwrites rather than duplicating; and the function already deletes
partial objects on a failed transfer, so no orphans accumulate.

The acceptance criterion as written ("resumes the transfer instead of
restarting it") is **not** met and cannot be without Stream. The user-visible
failure it was protecting against — a blip costing the reporter their upload —
is resolved.

**Still needs a browser (2).** Inline playback and scrubbing in the real thread,
and the carrier view (API-level only — there is still no carrier UI).

---

## 3. Verification status

- `tests/file-upload-input.test.tsx` — 13/13 pass.
- `cdn-upload-handler`, `support-attachment-validation`, `support-cdn-storage`,
  `merchant-support-attachment-actions` — 30/30 pass.
- `npx tsc --noEmit` — no errors in touched files (repo has unrelated
  pre-existing errors).
- **Not yet verified:** the real `.mp4` upload end-to-end after this fix, inline
  playback and seeking (206 + `Content-Range`), cross-tenant 403, and the
  merchant new-ticket video path.

---

## 4. Next actions

1. **Retest the failing `.mp4`** in the HQ composer. This is the fix's real
   proof; the unit tests only cover the token-selection logic.
2. If it still fails, re-read `cdn-upload` logs — the function logs a specific
   reason for every rejection, which is far faster than reasoning from the
   client's generic message.
3. Confirm inline playback seeks (206 responses in the network panel).
4. Test the merchant new-ticket video path (§2.2, §2.3).
5. Close the `add_ticket_message_with_attachments` gap (§2.1) — the Codex task.
