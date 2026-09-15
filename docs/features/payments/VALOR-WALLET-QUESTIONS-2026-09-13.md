# Valor — Apple Pay / Google Pay for Online Web Payments

**Purpose:** Technical questions for our Valor / Nuvei integration rep to determine whether (and how) we can accept **Apple Pay and Google Pay on the web** for our online store / QR-code ordering checkout.

**Date:** 2026-09-13
**From:** Dexa POS engineering
**Context:** We are live on Valor's **Passage.js v2** rail for card-not-present online orders and want to add digital-wallet (Apple Pay / Google Pay) express checkout.

---

## 1. Our current integration (so you know exactly where we are)

We process online / QR-ordering payments today with **Passage.js v2** + your transaction API:

| Step | Call | Details |
|------|------|---------|
| Mint client token | `POST /?gptoken` | `txn_type: "clientToken"`, with `appid` + `appkey` + `epi` (server-side only) |
| Collect card | Passage.js v2 | `https://js.valorpaytech.com/V2/js/Passage.min.js`, `variant: "inline"`, billing address on. Returns a single-use card token to the browser. |
| Charge | `POST /?sale` | `txn_type: "sale"`, `ecomm_channel: "passagejs"`, `token` = Passage card token, `amount`, `invoicenumber`, tax/tip, AVS fields |

- Credentials are per merchant+location: `appid`, `appkey` (encrypted at rest, decrypted server-side only), `epi` (10-digit, starts with `2`).
- Sandbox host in use: `securelink-staging.valorpaytech.com:443`.
- We **never** touch raw PAN; card data stays in Passage iframes.

**What we've confirmed from your public docs:** Passage.js v2 supports **card + ACH only** — we found no wallet attributes, no Apple/Google Pay option, and no wallet-token field on the Sale API. The Apple/Google Pay support we see advertised appears to be the **ValorPay mobile "Tap to Pay" (in-person NFC)** product, not the web e-commerce rail. Please correct us if that's wrong.

---

## 2. Core questions

### A. Capability & product
1. Does Valor support **Apple Pay and Google Pay for the web** (not in-person Tap to Pay)? If yes, **which product** delivers it?
   - An updated **Passage.js** with wallet buttons?
   - A **hosted checkout page** with wallets built in?
   - A direct **API** that accepts a wallet payload?
2. Is web-wallet acceptance delivered via the **Nuvei** integration? If so, does it require **re-boarding** merchants onto a Nuvei-backed Valor account, separate from our current Passage.js EPIs?

### B. If Passage.js can do it
3. What Passage.js version/config enables Apple Pay / Google Pay? Please share the exact init options / data-attributes and any sample.
4. Do the wallet buttons return the **same single-use token** our current `?sale` (`ecomm_channel: "passagejs"`) already accepts, or a different token/channel value?

### C. If it's a direct API (we build the wallet buttons ourselves)
5. If we implement the browser side ourselves (**Apple Pay JS API** + **Google Pay API**), what endpoint/field ingests the wallet payload?
   - Apple Pay: do you accept the **Apple Pay payment token** (encrypted `paymentData`) directly, or a decrypted **network token / DPAN + cryptogram**?
   - Google Pay: do you accept the **Google Pay encrypted token** directly, or a decrypted payload?
6. What is the request shape — new `txn_type`, new `ecomm_channel`, or a `walletToken`/`walletType` field on the existing `?sale`?

### D. Merchant enablement / onboarding (required for web wallets)
7. **Apple Pay:** Who registers the **Apple Pay Merchant ID** and handles **domain verification** (hosting the `apple-developer-merchantid-domain-association` file)? Is it per-merchant or one shared Dexa merchant ID? Do you provide the **merchant session** for `ApplePaySession.validateMerchant`, or do we?
8. **Google Pay:** What **gateway** and **gateway merchant ID** do we pass in the Google Pay `PaymentDataRequest` (`tokenizationSpecification`)? Is Valor a recognized Google Pay gateway, or is it Nuvei under the hood?
9. Any per-merchant underwriting / enablement flags we need set on each EPI before wallets work?

### E. Environments & testing
10. Sandbox support for wallets? What test host, test wallet cards, and merchant IDs do we use to validate end-to-end in sandbox before go-live?
11. Do wallet transactions settle/report the same as our current Passage.js sales (same batch/webhook flow)?

---

## 3. What we need to unblock a build

The single most important answer is **B/C**: *can we get a web endpoint that ingests an Apple Pay / Google Pay wallet payload for our merchants' EPIs*, and if so, whether it rides the current Passage.js EPIs or requires Nuvei re-boarding. Everything on our side (browser wallet buttons, domain verification, re-enabling our existing express-checkout UI) is ready to build the moment that path is confirmed.

---

## 4. Internal notes (not for Valor)

- Front-end scaffolding already exists but is disabled: `app/sites/components/checkout/ExpressCheckoutSection.tsx` (Apple/Google/Square buttons, "Coming soon", unrendered).
- DB flags already exist and are unused: `supports_apple_pay` / `supports_google_pay` on the storefront payment config RPC — gate the feature on these once live.
- Relevant code: `lib/payments/valor/passageClient.tsx`, `lib/payments/valor/saleApi.ts`, `supabase/functions/_shared/valor.ts`, `supabase/functions/process-online-payment/`, `supabase/functions/create-online-order/`.
- Likely build path if Valor confirms a direct API: browser-side Payment Request (Apple Pay JS + Google Pay API) → wallet token → new server route mirroring `create-online-order`'s charge, swapping the Passage card token for the wallet payload.
