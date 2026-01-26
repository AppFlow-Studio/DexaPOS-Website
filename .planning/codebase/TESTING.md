# Testing Patterns

**Analysis Date:** 2026-01-25

## Test Framework

**Runner:**
- Vitest 4.0.16 (configured in `vitest.config.ts`)
- Config: `/Users/temurbeksayfutdinov/Documents/AppFlowStudios/dexapos-website/vitest.config.ts`
- Environment: Node.js (for server-side integration tests)
- Globals enabled: `true` (no need to import describe, it, expect)

**Assertion Library:**
- Vitest's built-in assertion library

**Run Commands:**
```bash
npm test              # Run all tests
npm test -- --watch  # Watch mode
npm test -- --coverage  # Coverage report
```

## Test File Organization

**Location:**
- Centralized test directory: `/tests/` (not co-located)
- Single test file observed: `/tests/orders.test.ts`

**Naming:**
- Pattern: `[feature].test.ts`
- Observed: `orders.test.ts`

**Structure:**
```
/Users/temurbeksayfutdinov/Documents/AppFlowStudios/dexapos-website/
├── tests/
│   └── orders.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('Orders API', () => {
  let supabase: ReturnType<typeof createTestSupabaseClient>;

  beforeAll(() => {
    supabase = createTestSupabaseClient();
  });

  it('should create order with valid data', async () => {
    // test implementation
  });
});
```

**Patterns:**
- `describe()` for test suites (one per API/feature)
- `it()` for individual test cases with descriptive names
- `beforeAll()` for setup (not beforeEach; single client instance)
- Async test support: test functions use `async () => {}`

## Mocking

**Framework:** None detected - tests use real Supabase client

**Patterns:**
```typescript
function createTestSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables...');
  }

  return createClient(supabaseUrl, supabaseKey);
}
```

**What to Mock:**
- No explicit mocking observed; integration tests use real DB connections
- Environment-based client creation allows switching between test/prod DB

**What NOT to Mock:**
- Database operations (use real client)
- Supabase RPC calls

## Fixtures and Factories

**Test Data:**
```typescript
const result = await OrdersAPI.createOrder({
  p_merchant_id: '2add44cb-f498-4653-aca3-a8f0ca258e70',
  p_location_id: '657a703d-37ef-423e-a72b-a8766f67941a',
  p_order_type: 'dine_in',
  p_table_number: '5'
}, supabase);
```

**Patterns:**
- Inline objects for test data (no factory pattern observed)
- UUIDs hardcoded (assumes test database has matching records)
- Named parameters matching SQL RPC function signatures

**Location:**
- Test data defined inline within test cases
- No separate fixtures directory

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
npm test -- --coverage
```

## Test Types

**Unit Tests:**
- Not observed in codebase
- Scope would be: Individual utility functions, validators
- Approach: Pure function testing with known inputs/outputs

**Integration Tests:**
- Scope: Supabase RPC functions and server actions
- Approach: Real database connections, end-to-end workflows
- Example: `tests/orders.test.ts` tests order creation, tax calculation, payment processing

**E2E Tests:**
- Not implemented
- Framework: None (would require Playwright/Cypress)

## Common Patterns

**Async Testing:**
```typescript
it('should create order with valid data', async () => {
  const result = await OrdersAPI.createOrder({
    p_merchant_id: '2add44cb-f498-4653-aca3-a8f0ca258e70',
    p_location_id: '657a703d-37ef-423e-a72b-a8766f67941a',
    p_order_type: 'dine_in',
    p_table_number: '5'
  }, supabase);

  expect(result.success).toBe(true);
  expect(result.order_id).toBeDefined();
});
```

**Error Testing:**
```typescript
it('should reject negative payment amounts', async () => {
  await expect(
    OrdersAPI.processPayment({
      p_order_id: 'test-order-id',
      p_payment_method: 'cash',
      p_amount: -10.00
    }, supabase)
  ).rejects.toThrow('Payment amount must be positive');
});
```

## Environment Configuration

**Required Environment Variables for Tests:**
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (or your Supabase URL)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**Optional (Recommended):**
```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
- Bypasses Row Level Security (RLS) policies
- Recommended for integration tests
- Found in Supabase dashboard under Settings > API > service_role key

## Test Database Strategy

**Approach:**
- Local Supabase instance recommended for tests: `http://127.0.0.1:54321`
- Service role key allows bypassing RLS in test environment
- Tests assume database schema and sample data exist

**Notes from vitest.config.ts:**
- Tests run in Node.js environment
- Environment variables read from `process.env`
- Can create `.env.test` file for test-specific configuration

## Current Testing Status

**Coverage:**
- Minimal: Only Orders API has dedicated tests (`tests/orders.test.ts`)
- Missing: Server actions, hooks, components, utilities
- Gap: No tests for auth flows, RLS enforcement, location scoping

**Recommendations:**
- Add tests for critical server actions: `app/dashboard/actions/`
- Test location scoping logic: `stores/location-store.ts`
- Test Zod validation schemas
- Add E2E tests for user workflows (UI-driven)

---

*Testing analysis: 2026-01-25*
