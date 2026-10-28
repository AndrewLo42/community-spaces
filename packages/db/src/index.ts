export * from "./schema";
export { connect, pgliteDir, type Connection, type Db } from "./client";
export { findRepoRoot, loadRootEnv } from "./env";

// Re-exported so every package uses the same drizzle-orm instance.
export { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
