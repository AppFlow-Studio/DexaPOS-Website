/**
 * The site-builder section contract.
 *
 * Pure TypeScript: no React, no Supabase, no network, no I/O. Everything that
 * later produces or consumes a merchant page — the database column shape, the
 * editor's generated forms, the server renderer's props, the binding resolver,
 * the publish gate — derives from what is defined here.
 *
 * See docs/features/website-builder/PLAN-01-INFRA-SECTION-CONTRACT.md
 */

export * from "./sections/kinds";
export * from "./sections/primitives";
export * from "./sections/types";
export * from "./sections/schemas";
export * from "./sections/registry";
export * from "./bindings/types";
export * from "./page-document";
export * from "./normalize";
export * from "./validate";
export * from "./mutations";
export { runMigrations, MIGRATIONS } from "./migrations";
export type { RawDocument, DocumentMigration, MigrationResult } from "./migrations";
