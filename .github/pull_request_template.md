## Summary

<!-- 1–3 bullets on what changed and why -->

## Test plan

- [ ]

## Migrations & schema checklist

- [ ] No files deleted under `supabase/migrations/` or `supabase/migrations/rollback/`
- [ ] No reduction in `schema.sql` beyond what this PR's migrations explain
- [ ] All new migration filenames have a timestamp strictly newer than the latest on the base branch
- [ ] If this PR contains a `Revert "Merge ..."` commit, I have re-added any sibling migrations that the revert removed (or the `allow-revert-merge` label is justified)

## Merge conflict resolution

- [ ] If I resolved a merge conflict that involved migrations, I kept **both sides** (migrations are append-only — never "ours" or "theirs" alone)
