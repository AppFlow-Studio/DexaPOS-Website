# Repository Agent Workflow

## Notion Tickets

- Notion access for this repository is authorized from the Notion/website connector flow, not from VS Code and not by installing a local plugin.
- For ticket work, search Notion first, fetch the exact page, and read the complete ticket plus discussions before planning or editing code.
- Do not implement from an abbreviated ticket summary when the full ticket is required.
- If Notion tools are unavailable, tell the user to reconnect the connector from Notion. Do not request another plugin installation or attempt to configure Notion from VS Code.
- Record the fetched ticket title, page ID, and URL in the repository ticket document so later sessions can recover the source contract.

## Change Discipline

- Inspect the current branch and worktree before editing.
- Do not edit the POS repository from a website-only ticket. Inspect it read-only when a shared contract must be verified, then document the remaining POS work.
- Do not execute shared-database migrations unless the user explicitly asks. Follow the migration discipline written in the source ticket.
- Do not commit or push unless the user explicitly asks.
