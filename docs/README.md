# DexaPOS Website Documentation

This directory is the canonical entry point for website documentation. Start
with the product area you are changing instead of searching dated files at the
repository root.

## Find Documentation

| Area | Use it for |
| --- | --- |
| [`features/`](features/README.md) | Product behavior, implementation plans, handoffs, runbooks, and feature QA |
| [`engineering/`](engineering/README.md) | Architecture, security, framework upgrades, database performance, and developer experience |
| [`quality/`](quality/README.md) | End-to-end QA, load tests, and cross-feature closure tracking |
| [`guides/`](guides/README.md) | Merchant and Dexa HQ user guides |
| [`handoffs/`](handoffs/README.md) | Cross-feature senior handoffs that cannot belong to one feature |
| [`tickets/`](tickets/README.md) | Active ticket-stream index |
| [`reference/`](reference/README.md) | Emergency and compact reference material |
| [`templates/`](templates/README.md) | Templates for new documentation |

## Documentation Rule

Every feature change must update or add documentation in its existing
`docs/features/<feature-name>/` folder. Create a new feature folder only when
no existing product area owns the behavior.

A useful feature document records only what another engineer needs to operate,
review, test, or extend the feature:

1. Purpose and scope.
2. Current behavior and important contracts.
3. Decisions and tradeoffs.
4. Files, migrations, environment variables, and dependencies.
5. Automated verification and exact manual QA.
6. Remaining work, blockers, and ownership.

Use [`engineering/developer-experience/AI-DOCUMENTATION-GUIDE.md`](engineering/developer-experience/AI-DOCUMENTATION-GUIDE.md)
to keep AI-assisted documentation concise and evidence-based.

## Repository-Level Files

- [`../README.md`](../README.md) remains the project entry point.
- [`../CLAUDE.md`](../CLAUDE.md) remains the repository AI/workflow contract.
- `../.planning/` remains tool-managed execution state. It is not canonical
  feature documentation and must link back to the relevant feature folder when
  a plan becomes durable.

## Approval Status

This structure is prepared locally for the DevEx ticket. It must be reviewed
and approved by Temur and Abubeckr before it is published or merged.
