/**
 * Test stub for the `server-only` marker package.
 *
 * The real module throws the moment it is imported outside a React Server
 * Component. Under Vitest there is no server/client boundary to violate, so it
 * turns "this module is server-side" into "this test file cannot load at all".
 *
 * Next.js still enforces the real boundary at build time through the bundler —
 * this shim exists so a test that reaches a server module through three layers
 * of imports can run, not to make server code client-safe.
 */
export {};
