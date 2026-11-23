export * from "./schema";
export { connect, type Connection, type Db } from "./client";
export { findRepoRoot, loadRootEnv } from "./env";

// Re-exported so every package uses the same drizzle-orm instance.
export { and, asc, between, count, countDistinct, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
