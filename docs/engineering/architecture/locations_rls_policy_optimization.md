# RLS Performance Optimization Guide

## Problems with the Original Policies

### 1. Per-Row Function Execution
```sql
-- SLOW: This runs for EVERY row returned
CREATE POLICY example ON table FOR SELECT USING (
    user_has_location_permission(auth.uid(), table.location_id, 'permission')
);
```
If your query returns 500 rows, the function executes 500 times.

### 2. JSONB Scanning Without Index
```sql
-- SLOW: Full JSONB scan
u.public_metadata->'roles' ? 'merchant.owner'
```
PostgreSQL can't use a regular B-tree index on JSONB containment checks.

### 3. Repeated Expensive Joins
Each policy independently joined: `members` → `merchants` → `users` → JSONB parse

### 4. No Query Plan Caching
PL/pgSQL functions inside RLS don't cache query plans between rows.

---

## Optimization Strategies Applied

### Strategy 1: Denormalized `user_roles` Table
Instead of parsing JSONB on every check:

```sql
-- OLD: Parse JSONB every time
SELECT jsonb_array_elements_text(public_metadata->'roles') ...

-- NEW: Simple indexed lookup
SELECT 1 FROM user_roles WHERE user_id = $1 AND role_code = $2
```

**Trade-off**: Requires a trigger to keep `user_roles` in sync when `users.public_metadata` changes.

### Strategy 2: GIN Index on JSONB
If you must query JSONB directly:

```sql
CREATE INDEX idx_users_roles_gin ON users USING GIN ((public_metadata->'roles'));
```

This makes the `?` operator use an index scan instead of sequential scan.

### Strategy 3: Specialized Helper Functions
Instead of one complex function, use focused functions:

| Function | Purpose | Speed |
|----------|---------|-------|
| `is_merchant_admin(merchant_id)` | Check admin status | Fast |
| `is_merchant_owner(merchant_id)` | Check owner status | Fast |
| `is_location_member(location_id)` | Check membership | Very Fast |
| `get_location_role(location_id)` | Get role code | Fast |

### Strategy 4: SQL Functions vs PL/pgSQL
```sql
-- FASTER: SQL function (can be inlined)
CREATE FUNCTION is_location_member(p_location_id UUID) RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM location_members WHERE ...);
$$ LANGUAGE SQL STABLE;

-- SLOWER: PL/pgSQL (cannot be inlined)
CREATE FUNCTION is_location_member(p_location_id UUID) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM location_members WHERE ...);
END;
$$ LANGUAGE plpgsql STABLE;
```

SQL functions can be inlined into the calling query, allowing the planner to optimize across function boundaries.

### Strategy 5: Composite Indexes
```sql
-- Covers the most common RLS check pattern
CREATE INDEX idx_location_members_user_location 
    ON location_members(user_id, location_id) 
    WHERE is_active = true;
```

This is a **covering index** with a **partial index** condition — it's small and fast.

### Strategy 6: Fast-Path Checks First
```sql
CREATE POLICY locations_select ON locations FOR SELECT USING (
    -- FAST: Direct membership check (most common case)
    EXISTS (
        SELECT 1 FROM location_members lm
        WHERE lm.location_id = locations.id
          AND lm.user_id = current_user_id()
          AND lm.is_active = true
    )
    OR
    -- SLOWER: Admin check (less common, short-circuits if first is true)
    is_merchant_admin(locations.merchant_id)
);
```

PostgreSQL evaluates `OR` conditions left-to-right and short-circuits.

### Strategy 7: Materialized View for Reports
For dashboards where real-time isn't critical:

```sql
CREATE MATERIALIZED VIEW mv_user_location_access AS
SELECT user_id, location_id, effective_role, access_type ...
```

Query the materialized view (no RLS overhead) and refresh periodically:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_location_access;
```

---

## When to Use Each Approach

| Scenario | Approach |
|----------|----------|
| Real-time POS operations | Optimized RLS policies |
| Admin dashboard with many locations | Materialized view |
| Bulk data exports | Service role (bypass RLS) |
| Single location lookup | RLS is fine |
| Listing all user's locations | Use `mv_user_location_access` |

---

## Performance Benchmarks (Expected)

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| List 100 locations | ~200ms | ~15ms | 13x |
| Check permission | ~8ms | ~1ms | 8x |
| List location members | ~150ms | ~10ms | 15x |

*Actual results depend on data volume and hardware.*

---

## Testing Your RLS Performance

### 1. Use EXPLAIN ANALYZE
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM locations;
```

Look for:
- `Seq Scan` → Bad (should be Index Scan)
- `Rows Removed by Filter` → High number means RLS is filtering a lot
- `Buffers: shared hit` → Good (data is cached)

### 2. Check Index Usage
```sql
SELECT 
    indexname,
    idx_scan,
    idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'location_members'
ORDER BY idx_scan DESC;
```

If `idx_scan` is 0, your index isn't being used.

### 3. Monitor Slow Queries
```sql
-- Enable in postgresql.conf or via Supabase dashboard
-- log_min_duration_statement = 100  -- Log queries > 100ms
```

---

## Maintenance Tasks

### Daily
- None required (RLS is automatic)

### Weekly
```sql
-- Refresh the access materialized view
SELECT refresh_user_location_access();

-- Update table statistics
ANALYZE location_members;
ANALYZE locations;
```

### After Bulk User Changes
```sql
-- If you bulk-update user roles, sync the denormalized table
-- The trigger handles individual updates, but for bulk:
TRUNCATE user_roles;
INSERT INTO user_roles (user_id, role_code)
SELECT u.id, role_code
FROM users u,
jsonb_array_elements_text(COALESCE(u.public_metadata->'roles', '[]'::jsonb)) AS role_code
WHERE EXISTS (SELECT 1 FROM roles WHERE code = role_code);
```

---

## Red Flags to Watch

1. **Queries taking > 100ms** with RLS enabled
2. **Sequential scans** on `location_members` or `user_roles`
3. **High `Rows Removed by Filter`** in EXPLAIN output
4. **Function calls** showing up as expensive in `pg_stat_user_functions`

---

## Decision: Do You Need All This?

**Start simple.** If you have:
- < 10 locations
- < 50 staff members
- < 1000 orders/day

The original RLS policies are probably fine. Optimize when you see actual slowness.

**Optimize proactively** if you have:
- 50+ locations
- 500+ staff members
- High-frequency POS transactions
- Dashboard queries across all locations