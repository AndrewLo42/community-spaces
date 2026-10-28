import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { connect } from "./client";
import { findRepoRoot } from "./env";

const migrationsFolder = path.join(findRepoRoot(), "packages", "db", "drizzle");
const conn = connect();

console.log(`Applying migrations (${conn.driver})…`);
if (conn.driver === "postgres") {
  await migratePostgres(conn.db, { migrationsFolder });
} else {
  await migratePglite(conn.db as never, { migrationsFolder });
}
await conn.close();
console.log("Done.");
