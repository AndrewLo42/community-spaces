import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadRootEnv } from "./env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export interface Connection {
  db: Db;
  close: () => Promise<void>;
}

/** Local Postgres in dev, Neon in production. Both come from DATABASE_URL. */
export function connect(): Connection {
  loadRootEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root.");

  // prepare: false keeps it compatible with Neon's pooled (pgbouncer) endpoint.
  const client = postgres(url, { prepare: false, max: 10 });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
