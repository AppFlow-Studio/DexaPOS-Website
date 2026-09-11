# Support Ticket Video Attachments

**Status:** Implemented — awaiting migration, `cdn-upload` deployment, and manual QA (see §8)
**Ticket source:** DEXA-00033 ("Bug: POS gets stuck when printing") — reporter had to push the repro video into an external chat thread.
**Date:** 2026-09-08

Enable video attachments (up to 100 MB) on support tickets, playable inline and
seekable in the ticket thread, for HQ, merchant, and carrier viewers.

---

## 1. Ticket claims corrected against the codebase

The originating ticket contained four factual errors. They are recorded here
because two of them change the implementation materially.

| Ticket claim | Reality | Impact |
|---|---|---|
| "Current uploader uses `storage.upload()`, limited to ~6 MB/request" | Image/PDF uploads use **pre-signed Supabase URLs**. Video uploads now stream through the authenticated `cdn-upload` Edge Function to Bunny. | No Supabase Storage size increase is needed for video. Resumable remains a separate decision — see §6. |
| "Reads already go through server-generated signed URLs. Keep that path." | Reads go through an **authenticated, audit-logging proxy**: [`/api/support/attachments/[attachmentId]`](../../../app/api/support/attachments/%5BattachmentId%5D/route.ts). Signed URLs were deliberately removed in a prior hardening pass (they were redeemable off-network and unauditable). | **Largest impact.** The proxy has no Range support, so `<video>` would not be seekable. See §3. |
| "Routes: `/manage`, `/office`, `/dashboard` — same uploader component" | `/office` is a **single stub file** with all content commented out. No carrier support route exists anywhere. The uploader has 4 consumers, all under `/dashboard` and `/manage`. | Carrier scope is authorization-only in this ticket. See §5. |
| "Upload fails silently or with a generic error" | Oversized/wrong-type files already render an inline chip error. | The gap is message *specificity* and wrong limits, not silence. |

---

## 2. Storage architecture

Support attachments now use two providers:

- Images and PDFs remain in the private Supabase `support-attachments` bucket.
- MP4, MOV, and WebM videos stream through the authenticated `cdn-upload` Edge
  Function into Bunny Storage under a tenant-scoped `support/` prefix.

No Supabase global or bucket size-limit change is required for video, and the
previous bucket migration was removed before it was applied.

The existing `support_ticket_attachments.file_path` column holds either the
legacy/private Supabase object path or, for video, the HTTPS Bunny CDN URL.
Ticket-detail actions deliberately omit `file_path`, so the CDN URL is not sent
to browsers; playback still goes through the authenticated and audited support
attachment proxy.

Deployment requirement: redeploy `cdn-upload` with its existing Bunny secrets.
The function now has a `support` category, a 100 MB ceiling, the three video MIME
types, canonical tenant paths, and a streamed request-to-Bunny body.

The database schema does not need a new URL column: the existing `file_path`
field already stores text. The migration
`20260909120000_support_video_cdn_metadata.sql` updates the HQ ticket-creation
function's metadata validation so video URLs and the 100 MB video ceiling are
accepted while images/PDFs retain their existing provider path and 5 MB limit.
It does not change any Supabase Storage setting.

---

## 3. Range request support in the attachment proxy (the real work)

The proxy currently calls `.download()`, buffering the entire object into memory
and returning it with `Content-Length` but **no `Accept-Ranges`**. For a 100 MB
video this means: the whole file loads before playback starts, and every seek
re-downloads all 100 MB through the Next server.

Required changes to [`route.ts`](../../../app/api/support/attachments/%5BattachmentId%5D/route.ts):

- Advertise `Accept-Ranges: bytes` on all responses.
- Parse the inbound `Range` header. On a valid ranged request respond **206
  Partial Content** with `Content-Range: bytes start-end/total` and a
  `Content-Length` of the slice.
- Fetch only the requested slice from the backing provider rather than buffering
  the whole object. Images/PDFs use the Supabase Storage REST endpoint; video
  uses the persisted, strictly host/path-validated Bunny CDN URL. Forward the
  Range header and stream the response body through.
- Malformed/unsatisfiable ranges → **416** with `Content-Range: bytes */total`.
- Preserve every existing behaviour: authorization, audit logging, PII flagging,
  `Cache-Control: private, no-store`, and the `?download=1` disposition switch.

**Audit-log volume caution.** Seeking fires many ranged requests. Logging every
one at the current fidelity would flood `audit_logs` and distort PII-access
reporting. Log the *first* request per attachment per session (the `Range: bytes=0-`
or non-ranged opener) at full fidelity; either skip or coarsely aggregate
subsequent partial requests. Decide this explicitly rather than inheriting it.

---

## 4. Client: validation, limits, and UX

In [FileUploadInput.tsx](../../../components/support/FileUploadInput.tsx):

- Extend `ALLOWED_TYPES` with `video/mp4`, `video/quicktime`, `video/webm`.
- Keep `MAX_FILES = 3`; enforce 5 MB for images/PDFs and 100 MB for video.
- **Derive `contentType` from the file extension when `file.type` is empty or
  `application/octet-stream`.** Browsers frequently report `.mov` as octet-stream.
  Send the derived type in the upload metadata and request `Content-Type` — this
  is what makes the iOS `.mov` case pass.
- Replace the two generic messages with reason-specific ones:
  - unsupported type → names the accepted types
  - oversize → names the applicable 5 MB or 100 MB cap
- Dropzone helper text states both provider limits and the 3-file maximum.
- Validate type **and** size before any bytes are sent.
- Per-file **progress bar with percentage and a cancel control**. A 100 MB upload
  with only a spinner is indistinguishable from a hung UI. `fetch()` cannot report
  upload progress — use `XMLHttpRequest` (`upload.onprogress`) or a stream, with
  an `AbortController`/`xhr.abort()` for cancel.
- Cancel must leave **no** `support_ticket_attachments` row and **no** orphaned
  object in either provider. Rows are inserted only after upload completes;
  discard actions route Supabase paths to Storage deletion and CDN URLs to the
  authenticated Bunny deletion path.
- The `(n/3 used)` counter must stay accurate for mixed image/video sets.

---

## 5. Carrier scope

Carrier access is **authorization-only** in this ticket; there is no carrier
support UI to change.

`support_tickets.carrier_id` is already populated at creation
([support.ts:234](../../../app/dashboard/actions/support.ts)), and
`carriers.clerk_org_id` maps to a Clerk org. Add a third authorization branch to
the proxy route alongside HQ and owning-merchant: caller's org matches the
`carriers` row referenced by the ticket's `carrier_id`.

Audit-log the carrier branch as a distinct action with the PII flag set — a
carrier viewing a merchant's attachment is cross-tenant access, equivalent to the
HQ case, not to the merchant-viewing-own case.

**Out of scope:** building a carrier-facing support inbox or ticket viewer. The
`/office` surface is an empty stub; that is a separate feature. The AC "plays for
the owning carrier" is therefore verified at the API level (authorized fetch
returns 206), not through a UI.

---

## 6. Resumable (TUS) — deliberately deferred

**Decision: not implemented in this ticket.** Rationale:

- The ticket's justification was that `storage.upload()` caps at ~6 MB. That path
  was not used by the original support uploader, and videos now stream to Bunny
  through `cdn-upload`; a Supabase TUS migration would target the wrong provider.
- CDN uploads authenticate with the caller's Clerk token. Resuming them would
  require a Bunny-compatible multipart/session protocol with server-issued,
  tenant-scoped upload state; the current Edge Function is a single streamed PUT.
- It is the single largest cost item in the ticket, and it is the only one whose
  premise did not survive verification.

Ship §2–§5 first and confirm real-world 100 MB uploads over typical merchant
connections. If failure rates on flaky connections prove material, raise
resumable as a follow-up with the token design addressed properly.

**Consequence:** the AC "killing the network mid-upload resumes rather than
restarts" is **not met by this ticket** and moves to the follow-up. Cancel and
progress reporting (§4) are still delivered.

---

## 7. Playback rendering

In [AttachmentList.tsx](../../../components/support/AttachmentList.tsx) — the
single shared render site for all four uploader consumers:

- Add a `file_type LIKE 'video/%'` branch rendering
  `<video controls preload="metadata">` pointing at the proxy URL, instead of a
  download link.
- Keep a download affordance (`?download=1`) alongside the player.
- `preload="metadata"` only works well once §3 lands; without Range support the
  browser pulls the whole file.

---

## 8. Verification

Against acceptance criteria. Every item requires observed evidence, not inference.

- [ ] Updated `cdn-upload` Edge Function deployed with the `support` category.
- [ ] `20260909120000_support_video_cdn_metadata.sql` applied in staging, then
      production after verification. It changes DB validation only.
- [ ] CDN upload returns a tenant-scoped URL; the URL is stored in
      `support_ticket_attachments.file_path` but omitted from ticket-detail payloads.
- [ ] 4 MB `.mp4` uploads and appears in the thread.
- [ ] 80 MB `.mp4` uploads and appears in the thread.
- [ ] iOS-recorded `.mov` reporting `application/octet-stream` uploads (explicit
      derived `contentType` applied).
- [ ] 120 MB file rejected client-side **before any bytes are sent**, message
      names the 100 MB cap.
- [ ] `.exe` rejected with a message naming accepted types.
- [ ] Progress visible throughout; cancel aborts with no DB row and no orphaned
      object (verify both the table and Bunny Storage).
- [ ] Video plays inline and **seeks without full download** — confirm 206
      responses and `Content-Range` in the network panel, not just that the
      scrubber moves.
- [ ] Authorized fetch returns 206 for HQ admin, owning merchant, and owning carrier.
- [ ] Merchant from a different tenant gets 403.
- [ ] Existing image and PDF uploads unaffected (regression).
- [ ] 3-attachment limit holds with mixed image/video sets; counter accurate.
- [ ] Audit-log volume during a seek-heavy playback session is sane (§3).
- [ ] `npx vitest run tests/file-upload-input.test.tsx` passes; extend with cases
      for video accept, oversize rejection, and octet-stream type derivation.

**Deferred to follow-up (not verifiable here):** network-interruption resume (§6).

---

## 8b. What was actually built

Files changed:

| File | Change |
|---|---|
| `supabase/functions/cdn-upload/index.ts` | Added streamed, authenticated 100 MB support-video uploads to tenant-scoped Bunny paths. Must be redeployed separately. |
| `supabase/migrations/20260909120000_support_video_cdn_metadata.sql` | Updates the service-only HQ creation RPC to accept tenant-scoped Bunny video URLs up to 100 MB while retaining 5 MB Supabase image/PDF rules. Not applied. |
| `app/api/support/attachments/[attachmentId]/route.ts` | Range parsing, 206/416 responses, provider-aware streaming from Supabase or a validated Bunny URL, carrier authorization, and opener-only audit logging (§3, §5). |
| `lib/support/attachment-constraints.ts` | **New.** Single source of truth for MIME list, size cap, file count, extension pattern, and content-type derivation. |
| `lib/support/cdn.ts` | **New.** Canonical support CDN filenames, owner paths, URL construction, and strict host/path parsing. |
| `lib/support/attachment-validation.ts` | **New.** Merchant metadata, MIME, size, and provider/path validation before service-role RPC writes. |
| `components/support/FileUploadInput.tsx` | Video types, 100 MB cap, XHR upload with progress + cancel, reason-specific errors, derived content type, unmount abort (§4). |
| `components/support/AttachmentList.tsx` | Inline `<video controls preload="metadata">` branch with download affordance (§7). |
| `app/dashboard/actions/support.ts` | Provider-aware upload targets, merchant attachment validation, URL persistence, and scoped orphan cleanup. |
| `app/manage/actions/support.ts` | Provider-aware HQ upload targets, validation for creation and replies, URL persistence, and scoped orphan cleanup. |
| `app/dashboard/hooks/useSupport.ts` | Re-export `DiscardSupportUpload`. |
| 4 uploader call sites | Wired `onDiscardUpload`; refreshed stale "5MB" helper copy. |
| `tests/file-upload-input.test.tsx` | XHR-based stub; added video, octet-stream `.mov`, oversize, unsupported-type, and cancel cases. |

### Four server-side gates the ticket did not mention

The ticket described the block as storage config plus a client filter. There were
**three** additional server-side gates in `app/manage/actions/support.ts`, plus
one database gate, any of which would have silently defeated video uploads:

1. A Zod `file_type` enum accepting only images/PDF.
2. A `file_size` cap of `5 * 1024 * 1024`.
3. A filename regex `/\.(png|jpe?g|webp|pdf)$/i` on the draft-upload action.
4. The `create_hq_support_ticket` database function repeated the old MIME list,
   5 MB limit, and Supabase draft-path check.

The action gates now derive from `lib/support/attachment-constraints.ts`; the
new migration updates the DB gate. Contract tests hold the separately deployed
CDN function and migration to the same provider split and size ceilings.

The previously recorded merchant server-validation gap is now closed for both
ticket creation and replies. HQ replies, which also previously trusted attachment
metadata, now pass through the same shape/type/size and owner-path gates.

### Verification status

- Focused attachment tests cover client validation/progress transport, CDN target
  selection, URL/path validation, and action-level rejection before RPC writes.
- `npx tsc --noEmit` — **no diagnostics in the touched Next.js files.** The
  repository-wide command still fails on a large pre-existing backlog. The
  touched Edge Function reports only the repository's expected Deno import,
  global, and untyped-client diagnostics under the Next.js TypeScript config;
  Deno itself is not installed in this workspace for `deno check`.
- Everything in §8 that requires a deployed Edge Function, real Bunny upload, or
  browser is **not yet verified**.

### Deployment order

Upload failure investigation (2026-09-10): downloading the live `cdn-upload`
source from project `dfwqakoyittmrwbqvxgw` confirmed that version 246's binary handler
buffered via `req.arrayBuffer()` and ran outside the top-level error boundary.
That version did not include the local streaming implementation. A thrown
storage/connection exception escaped the handler in regression tests, which can
leave the browser without a CORS-readable error and show "Network error" after
"Finishing". The particular live storage failure is not yet confirmed by logs.

The local function now includes binary/auth setup in the error boundary, returns
readable 502/504 storage failures, bounds the storage PUT to 120 seconds and
cleanup DELETEs to 10 seconds, and attempts partial-object cleanup on transfer
exceptions. Early upstream rejection retains its status instead of becoming an
invalid-length error. `tests/cdn-upload-handler.test.ts` executes the real handler
with mocked SDK/network boundaries; all 31 tests across the five focused support
upload suites pass.

Deployment (2026-09-10, explicitly authorized by the user): deployed only
`cdn-upload` to project `dfwqakoyittmrwbqvxgw`; readback reports **ACTIVE, version
247**. Downloaded the deployed source and confirmed streaming, storage deadlines,
the binary error boundary, and readable storage-failure responses are present.
Live browser preflight returned 200 with the required CORS headers; an
unauthenticated binary POST returned CORS-readable 401. Gateway JWT verification
remains disabled as configured; Clerk verification inside the function remains
required. A real authenticated browser video upload is still pending. No database
migration, unrelated function deployment, website deployment, commit, or push was
performed in this deployment step.

1. Deploy `cdn-upload` so the `support` upload/delete lane exists.
2. Apply `20260909120000_support_video_cdn_metadata.sql` in staging and verify HQ
   ticket creation with both provider types.
3. Deploy the website code, complete §8, then repeat the migration/function
   rollout in production.

---

## 9. Follow-ups to raise separately

- **Resumable/TUS uploads** with a server-issued upload-token design (§6).
- **React Native / Expo POS tablet**: confirm whether it exposes a support
  attachment flow. If so it needs an equivalent authenticated CDN upload client.
- **Carrier support surface**: `/office` is a stub; a carrier ticket inbox is
  unbuilt (§5).
- Server-side transcoding, thumbnails, compression — explicitly out of scope.
