# AI-Assisted Documentation Guide

## Goal

Use AI to reduce documentation effort without creating long, duplicated, or
unverified documents. The engineer remains responsible for scope, accuracy,
and evidence.

## Minimum Workflow

1. Find the existing feature folder under `docs/features/`.
2. Ask AI to inspect the changed files, current feature docs, and ticket before
   drafting anything.
3. Update the existing canonical document when possible. Do not create a new
   status file for every conversation.
4. Record contracts, decisions, migrations, environment variables, test
   results, manual QA, and remaining work. Omit implementation narration that
   can be read directly from the diff.
5. Require exact file references and separate confirmed behavior from
   assumptions or pending QA.
6. Run the documentation link/inventory checks before requesting review.

## Prompt Template

```text
Read the ticket, the current feature documentation, and the changed files.
Update the canonical document in docs/features/<feature>/.

Keep it concise and include:
- goal and scope
- current behavior and contracts
- decisions and tradeoffs
- files/migrations/env dependencies
- tests run with results
- exact manual QA
- remaining work and owner

Do not invent results, duplicate existing docs, edit unrelated files, or mark
manual QA complete without evidence. Report every documentation path changed.
```

## What Good AI Documentation Looks Like

- It is organized by feature, not by chat session or developer name.
- It distinguishes implemented, deployed, tested, and approved states.
- It links to the canonical ticket or index instead of copying the full ticket.
- It states database and environment dependencies explicitly.
- It gives another engineer enough information to validate or continue the
  work without replaying the original conversation.

## Avoid Overworking It

Do not ask AI to restate obvious code, produce speculative architecture, or
create multiple summaries of the same change. One maintained feature document
plus a short PR description is normally sufficient.

## Ready-to-Post Group Message

```text
Docs are now organized by feature under docs/features/. When using AI, first
point it to the ticket, changed files, and the existing feature folder. Ask it
to update the canonical doc with contracts, decisions, migrations/env needs,
tests, manual QA, and remaining work. Do not create a new document for every
chat or let AI claim unverified results. Every new feature should ship with a
doc in its feature folder, and cross-feature material belongs under
docs/engineering, docs/quality, or docs/handoffs.
```

Posting this message to the engineering group remains a manual ticket step.
