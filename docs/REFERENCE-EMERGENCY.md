# Emergency Reference

**Purpose:** single source of truth when thread context is lost or stale.

## How To Use

1. Read this file first.
2. Open the specific feature document listed in `Feature Index`.
3. Treat feature docs as canonical over chat history.
4. When a feature changes, update its feature doc in the same PR/commit.

## Current State Snapshot (2026-04-09)

- Online ordering (demo mode) has embedded card tokenization enabled.
- Live sale processing is currently bypassed for demo stability.
- Demo card orders should store:
  - `payment_method = card`
  - `card_type`
  - `card_last_four`
- Cancel behavior target:
  - card/demo-card pending orders -> `void`
  - cash pending orders -> `cancelled`

## Feature Index

- `docs/FEATURE-ONLINE-ORDERING-PAYMENTS.md`
- `docs/SPRINT-2026-04-08-ONLINE-ORDERING-PAYMENTS-HANDOFF.md`
- `docs/PLAN-2026-06-22-BAY-RIDGE-OWNER-IDENTITY-RELINK.md`

## Operating Rules For Future Updates

- Keep one feature = one document.
- Record:
  - goal
  - active mode (demo vs live)
  - deployed behavior
  - known bugs
  - next actions
- Add exact file paths touched under each feature.
- Do not store secrets, tokens, or credentials in docs.

## Last Updated

- 2026-04-09
