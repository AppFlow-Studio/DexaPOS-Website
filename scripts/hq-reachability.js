#!/usr/bin/env node
/**
 * Which files under a route subtree are actually reachable from a route?
 *
 * The HQ rollout audit (docs/features/hq-redesign/route-audit-matrix.md) scopes
 * each family to the files its routes actually mount. A file-count alone
 * overstates the work: Family 3 carries 56 files that no route can reach.
 *
 * Walks the static import graph from every route entry (page/layout/loading/
 * error). Verify there are no dynamic `import()` calls in the subtree before
 * trusting the result -- those are invisible to this walk.
 *
 *   node scripts/hq-reachability.js "app/manage/merchants/[merchantId]"
 */
const fs = require('fs')
const p = require('path')

const ROOT = process.argv[2] || 'app/manage/merchants/[merchantId]'
if (!fs.existsSync(ROOT)) {
    console.error(`no such directory: ${ROOT}`)
    process.exit(1)
}

const files = []
;(function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = p.join(dir, e.name)
        if (e.isDirectory()) walk(f)
        else if (/\.(tsx|ts)$/.test(e.name)) files.push(f.split(p.sep).join('/'))
    }
})(ROOT)

/** Resolve an import specifier to a repo path, mirroring the `@/*` alias. */
function resolve(src, spec) {
    let base
    if (spec.startsWith('@/')) base = spec.slice(2)
    else if (spec.startsWith('.')) base = p.normalize(p.join(p.dirname(src), spec)).split(p.sep).join('/')
    else return null // bare package specifier
    for (const c of [base + '.tsx', base + '.ts', base + '/index.tsx', base + '/index.ts']) {
        if (fs.existsSync(c)) return c.split(p.sep).join('/')
    }
    return null
}

const graph = {}
for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8')
    graph[f] = new Set()
    for (const m of txt.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const t = resolve(f, m[1])
        if (t) graph[f].add(t)
    }
}

const entries = files.filter((f) => /\/(page|layout|loading|error)\.tsx$/.test(f))
const seen = new Set()
const stack = [...entries]
while (stack.length) {
    const n = stack.pop()
    if (seen.has(n)) continue
    seen.add(n)
    for (const t of graph[n] || []) stack.push(t)
}

const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').length
const dead = files.filter((f) => !seen.has(f)).sort()
const live = files.filter((f) => seen.has(f)).sort()
const sum = (a) => a.reduce((n, f) => n + lines(f), 0)

console.log(`root:        ${ROOT}`)
console.log(`entries:     ${entries.length}`)
console.log(`reachable:   ${live.length} files, ${sum(live)} lines`)
console.log(`unreachable: ${dead.length} files, ${sum(dead)} lines\n`)
console.log('--- UNREACHABLE ---')
for (const f of dead) console.log(String(lines(f)).padStart(6), f)
