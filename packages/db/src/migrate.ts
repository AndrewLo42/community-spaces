import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connect } from "./client";
import { findRepoRoot } from "./env";

const migrationsFolder = path.join(findRepoRoot(), "packages", "db", "drizzle");
const { db, close } = connect();

console.log("Applying migrations…");
await migrate(db, { migrationsFolder });
await close();
console.log("Done.");
