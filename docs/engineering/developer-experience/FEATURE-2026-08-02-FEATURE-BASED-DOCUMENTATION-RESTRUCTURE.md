# [DevEx] Feature-Based Documentation Restructure - Website

## Ticket

- Source: Notion page `3b08280c-1b1d-80c2-a579-d2cc90aaa078`
- Repository: DexaPOS-Website only
- Status: Local implementation prepared; reviewer approval pending
- Required reviewers: Temur and Abubeckr

## Goal

Make feature handoff and onboarding predictable by giving every durable product
document a feature owner and a discoverable path.

## Scope

- Reorganize existing website documentation without rewriting feature content.
- Preserve all tracked Markdown, PDF, text, and documentation SQL artifacts.
- Add central, feature, engineering, quality, and operational indexes.
- Add a concise guide for responsible AI-assisted documentation.
- Update repository references to moved paths.

The POS repository is explicitly out of scope for this implementation pass.

## Structure

```text
docs/
|-- README.md
|-- features/<feature-name>/
|-- engineering/<cross-cutting-area>/
|-- quality/<test-area>/
|-- guides/
|-- handoffs/
|-- reference/
|-- templates/
`-- tickets/
```

Root `README.md` and `CLAUDE.md` remain at the repository root. `.planning/`
remains in place because it is tool-managed execution state rather than the
canonical documentation library.

## Progress

- [x] Inventory repository documentation.
- [x] Define a website feature taxonomy.
- [x] Move tracked documents without dropping content.
- [x] Add navigation indexes and the AI documentation guide.
- [x] Update every moved-path reference.
- [x] Verify inventory parity and local links.
- [ ] Obtain Temur and Abubeckr approval before publish/merge.
- [ ] Post the AI guide summary to the engineering group.
- [ ] Coordinate the separate POS repository restructure.

## Verification

The final local verification must confirm:

1. Every pre-migration tracked documentation artifact has a destination.
2. No Markdown reference points to a removed `docs/`, `tasks/`, root, or
   `utils/migrations/` documentation path.
3. Every feature folder has a `README.md` index.
4. Root project instructions point contributors to the canonical docs index.
5. Git records document relocation as renames rather than delete-and-recreate
   where content is unchanged.

### Local Results - 2026-08-02

- 112 tracked documentation artifacts relocated.
- 112 destination files present; 0 missing.
- 34 documentation directories checked; every directory has a `README.md`.
- 0 stale website references to the removed documentation paths.
- 0 broken local project links across Markdown files after excluding dynamic
  `.claude` template placeholders.
- `git diff --cached --check` passes.
- Targeted ESLint passes for the six source/script files whose documentation
  path comments or output text changed.
- Repository root now contains only `README.md` and `CLAUDE.md` as Markdown.
- `docs/` root now contains only the canonical `README.md` entry point.

## Manual Review

1. Open `docs/README.md` and locate a feature by name.
2. Open three representative feature indexes: online ordering, menu
   management, and reporting.
3. Follow links to a plan, handoff, runbook, and QA artifact.
4. Confirm `.planning/` is described but not presented as canonical feature
   documentation.
5. Review the AI guide and approve the ready-to-post group message.

## Approval Gate

Do not commit, push, publish, or merge this restructure until Temur and
Abubeckr approve the proposed hierarchy. Their approval is a ticket dependency,
not a documentation-only follow-up.
