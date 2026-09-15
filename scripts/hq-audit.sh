#!/usr/bin/env bash
# Regenerates the raw numbers behind docs/features/hq-redesign/route-audit-matrix.md
# and checks the invariants the HQ design-system rollout depends on.
#
# Usage: bash scripts/hq-audit.sh
#
# See docs/UI-DESIGN-SYSTEM.md §14 and
# docs/superpowers/specs/2026-09-15-hq-portal-design-system-rollout-design.md

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo "=== HQ conversion progress ==="
printf 'TSX files under app/manage      %s\n' "$(find app/manage -name '*.tsx' | wc -l)"
printf 'importing components/ui/card    %s\n' "$(grep -rl 'components/ui/card' app/manage --include=*.tsx | wc -l)"
printf 'importing dashboard/shell       %s  (rises as families convert)\n' "$(grep -rl 'dashboard/shell' app/manage --include=*.tsx | wc -l)"
printf 'distinct hand-rolled <h1>       %s  (target: 0)\n' "$(grep -rho '<h1 className="[^"]*"' app/manage --include=*.tsx | sort -u | wc -l)"
printf 'routes (page.tsx)               %s\n' "$(find app/manage -name 'page.tsx' | wc -l)"

echo
echo "=== Invariants (each must report OK) ==="
fail=0

# 1. No HQ page may render PageShell without as="div" — a second <main>.
bad=$(grep -rn '<PageShell' app/manage --include=*.tsx | grep -v 'as="div"')
if [ -z "$bad" ]; then echo "OK   no HQ PageShell missing as=\"div\""
else echo "FAIL HQ PageShell without as=\"div\":"; echo "$bad"; fail=1; fi

# 2. Every rendered DataPageSkeleton in HQ keeps shell="plain".
#    Match `<DataPageSkeleton`, not the bare name: support/loading.tsx mentions
#    it in a docblock and a plain-name grep false-positives on it.
bad=$(grep -rl '<DataPageSkeleton' app/manage --include=*.tsx | xargs -r grep -L 'shell="plain"')
if [ -z "$bad" ]; then echo "OK   every HQ DataPageSkeleton passes shell=\"plain\""
else echo "FAIL DataPageSkeleton without shell=\"plain\":"; echo "$bad"; fail=1; fi

# 3. Behaviour freeze: no backend/package changes in the working tree.
bad=$(git diff --name-only HEAD 2>/dev/null | grep -E '^(supabase/|package\.json|package-lock\.json|.*\.lock)')
if [ -z "$bad" ]; then echo "OK   no backend/package changes"
else echo "FAIL backend or package files changed:"; echo "$bad"; fail=1; fi

echo
echo "=== Per-route counts ==="
printf '%-52s %6s %6s %7s %5s\n' ROUTE LINES CARD TABLE H1
for f in $(find app/manage -name 'page.tsx' | sort); do
  route=${f#app}; route=${route%/page.tsx}; [ -z "$route" ] && route=/manage
  printf '%-52s %6s %6s %7s %5s\n' \
    "$route" "$(wc -l < "$f")" "$(grep -c '<Card' "$f")" \
    "$(grep -c '<Table' "$f")" "$(grep -c '<h1' "$f")"
done

echo
[ "$fail" -eq 0 ] && echo "All invariants OK." || echo "One or more invariants FAILED."
exit "$fail"
