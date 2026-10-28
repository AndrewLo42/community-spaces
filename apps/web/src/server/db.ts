import { connect, type Connection } from "@cs/db";
import * as schema from "@cs/db/schema";

// One connection pool per server process, reused across dev hot reloads.
// The pool has the schema baked in, so it's keyed by the schema module: a
// reload that changes the schema gets a fresh pool. Next.js dev keeps several
// module graphs alive at once (pages, route handlers), each with its own copy
// of the schema module, so old pools are left open rather than closed under
// whoever is still using them. Production never reloads, so it has exactly one.
const globalForDb = globalThis as unknown as { dbPools?: WeakMap<object, Connection> };
const pools = (globalForDb.dbPools ??= new WeakMap());

let connection = pools.get(schema);
if (!connection) {
  connection = connect();
  pools.set(schema, connection);
}

export const db = connection.db;
