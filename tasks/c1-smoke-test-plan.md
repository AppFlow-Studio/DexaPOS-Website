# C1 Smoke Test Plan

**Branch:** c1-clerk-cve-bump  
**Date:** April 30, 2026  
**Objective:** Verify login + protected routes work after Clerk bump to @clerk/shared ≥ 3.47.4

## Pre-Test Checklist
- [ ] npm install completes successfully
- [ ] `npm ls @clerk/shared` shows ≥ 3.47.4
- [ ] `npm audit --audit-level=high` returns 0 (or no new critical issues)
- [ ] Branch is c1-clerk-cve-bump

## Test Steps

### 1. Local Dev Server
```bash
npm run dev
# Should start on http://localhost:3000
```
Wait for Turbopack to compile fully (watch for "compiled successfully" message).

### 2. Test Login Flow
1. Navigate to http://localhost:3000
2. Click "Sign In" or go to /sign-in
3. Complete Clerk login flow with test account
4. Should redirect to dashboard after login
5. Verify token is cached correctly in localStorage under `clerk-db`

### 3. Test Protected Route
1. After login, navigate to http://localhost:3000/dashboard/menu
2. Should load without auth errors
3. Open DevTools → Application → Local Storage
4. Verify `clerk-db` key exists and contains proper structure

### 4. Test Session Persistence
1. Refresh the page (F5)
2. Should not trigger re-authentication (session should persist)
3. Check `clerk-db` in localStorage — shape should match pre-refresh

### 5. Sentry Monitoring (30 min post-commit)
After merging to main:
- [ ] Monitor Sentry Issues dashboard for auth-related errors
- [ ] Filter for: Last 30 minutes, authentication OR session OR token
- [ ] Check for any `persist hydration` or `state corruption` errors
- [ ] Look for Clerk-related errors from token-cache

## Expected Results
✅ All steps pass without errors  
✅ No auth-related Sentry issues  
✅ @clerk/shared = 3.47.4 or higher  
✅ localStorage `clerk-db` shape is consistent across refreshes  

## Failure Scenarios
🚫 **Scenario 1: Login fails**
- Check browser console for Clerk errors
- Verify NEXT_PUBLIC_CLERK_* env vars are set
- Escalate to Jaffal (might indicate H1 migration needed)

🚫 **Scenario 2: Persist hydration error in Sentry**
- Roll back C1
- Verify H1 version fields are present in all Zustand stores
- Retry after H1 verification

🚫 **Scenario 3: @clerk/shared still < 3.47.4**
- May need to manually bump @clerk/nextjs to next minor version
- Check npm registry for available Clerk versions

## Abort Conditions
If any of these occur, DO NOT MERGE:
- Login flow fails (auth not working)
- Protected routes throw 401/403 errors
- Sentry shows persist corruption errors
- @clerk/shared is not ≥ 3.47.4
