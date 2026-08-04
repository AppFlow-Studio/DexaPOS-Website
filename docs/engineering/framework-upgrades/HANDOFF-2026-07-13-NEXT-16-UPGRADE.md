# Next 16 Upgrade Handoff

## Ticket

`Update to Next 16.0`

## Current Repo Status

The repo is already on the Next 16 line:

- `next`: `^16.2.10`
- `eslint-config-next`: `^16.2.10`
- `react`: `19.2.7`
- `react-dom`: `19.2.7`
- `typescript`: `^7.0.2`

This satisfies the Next 16.0 upgrade target, while using the newer 16.2 patch line.

## Config Status

Checked:

- `next.config.ts` does not contain the removed `eslint` config key.
- Root `proxy.ts` exists.
- No root `middleware.ts` exists.
- `next.config.ts` uses Turbopack config:
  - `turbopack.root`
  - `turbopack.resolveAlias`
- `next.config.ts` keeps required externals:
  - `resend`
  - `twilio`
  - `telnyx`
- `next.config.ts` keeps `typescript.ignoreBuildErrors = true`.

The earlier Next 16 warnings to watch for were:

- `eslint` key in `next.config.ts` is no longer supported.
- `middleware.ts` convention is deprecated; use `proxy.ts`.

Those two are already handled in the current repo shape.

## Package / Lockfile Note

Before this doc was created, `package-lock.json` was already modified in the working tree.

Do not assume this doc changed dependencies.

If dependency changes are intended, review `package-lock.json` separately before committing.

## Known Risk Areas After Next 16

- `npm run lint` currently maps to `next lint`.
- Next 16 removed/deprecated `next lint` behavior, so this script may need replacement with direct `eslint`.
- Turbopack is used for both dev and build:
  - `next dev --turbopack`
  - `next build --turbopack`
- Existing repo-wide TypeScript errors are still present outside the latest touched files.
- Supabase Edge Functions use Deno-style imports and are included in the broad TypeScript scan, which creates unrelated local `tsc` failures.

## Recommended Follow-Up Change

Replace:

```json
"lint": "next lint"
```

with an ESLint CLI command after confirming the desired scope, for example:

```json
"lint": "eslint ."
```

Do this as a small separate commit because it can surface many repo-wide lint findings.

## Production Test Command

Run:

```powershell
npm run build
```

Expected:

- Next 16 build starts with Turbopack.
- No `eslint` config warning from `next.config.ts`.
- No `middleware` convention warning if only `proxy.ts` exists.

If build fails, capture:

- first error block,
- import trace,
- route/page involved,
- whether the failure is a Next 16 API change or an existing repo type/runtime issue.

## Manual QA Checklist

1. Start local dev:

```powershell
npm run dev
```

2. Confirm app boots on `http://localhost:3000`.
3. Sign in with Clerk.
4. Open HQ routes:
   - `/manage`
   - `/manage/devices`
   - `/manage/subscriptions`
5. Open merchant routes:
   - `/dashboard`
   - `/dashboard/orders`
   - `/dashboard/staff`
6. Open storefront route:
   - `/sites/<slug>`
7. Confirm auth redirects still work.
8. Confirm subdomain/storefront routing still works through `proxy.ts`.
9. Run production build:

```powershell
npm run build
```

10. Record any Next 16-specific errors separately from pre-existing app errors.

## Done Criteria

- Local dev boots without Next config warnings.
- Production build runs or only fails on documented unrelated repo issues.
- Auth-protected routes still gate correctly.
- Public invoice/receipt/storefront routes remain public.
- `next lint` script is either replaced or explicitly documented as pending.
- Package lock changes are reviewed and intentional.
