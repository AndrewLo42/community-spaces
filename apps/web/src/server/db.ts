import { connect, type Db } from "@cs/db";

// One connection pool per server process; survives dev hot reloads.
const globalForDb = globalThis as unknown as { db?: Db };

export const db: Db = globalForDb.db ?? connect().db;
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
