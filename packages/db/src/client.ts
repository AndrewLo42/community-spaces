import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { findRepoRoot, loadRootEnv } from "./env";
import * as schema from "./schema";

// The query-builder API is identical across both drivers, so the app sees a
// single Db type. Only migrate.ts needs to know which driver is underneath.
export type Db = PostgresJsDatabase<typeof schema>;

export type Connection =
  | { driver: "postgres"; db: Db; close: () => Promise<void> }
  | { driver: "pglite"; db: Db; close: () => Promise<void> };

export function pgliteDir(): string {
  return process.env.PGLITE_DIR ?? path.join(findRepoRoot(), ".data", "pglite");
}

/**
 * DATABASE_URL set → real Postgres (Neon in production).
 * Otherwise → embedded PGlite stored in .data/pglite, so local dev needs no install.
 */
export function connect(): Connection {
  loadRootEnv();
  const url = process.env.DATABASE_URL;

  if (url) {
    // prepare: false keeps it compatible with Neon's pooled (pgbouncer) endpoint.
    const client = postgres(url, { prepare: false, max: 10 });
    return { driver: "postgres", db: drizzlePostgres(client, { schema }), close: () => client.end() };
  }

  const dir = pgliteDir();
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  return {
    driver: "pglite",
    db: drizzlePglite(client, { schema }) as unknown as Db,
    close: () => client.close(),
  };
}
