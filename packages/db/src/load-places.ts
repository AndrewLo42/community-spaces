import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { connect } from "./client";
import { findRepoRoot } from "./env";
import { places } from "./schema";

// Loads packages/db/data/us-places.tsv (trimmed from GeoNames cities1000,
// CC BY 4.0) into the places table. Safe to re-run: rows are upserted by id.

const file = path.join(findRepoRoot(), "packages", "db", "data", "us-places.tsv");
const [header, ...lines] = readFileSync(file, "utf8").trim().split("\n");
if (header !== "id\tname\tascii_name\tstate\tlat\tlng\tpopulation") throw new Error(`Unexpected header in ${file}`);

const rows = lines.map((line) => {
  const [id, name, asciiName, state, lat, lng, population] = line.split("\t");
  return {
    id: Number(id),
    name: name!,
    asciiName: asciiName!,
    state: state!,
    lat: Number(lat),
    lng: Number(lng),
    population: Number(population),
  };
});

const { db, close } = connect();
const BATCH = 1000;
for (let i = 0; i < rows.length; i += BATCH) {
  await db
    .insert(places)
    .values(rows.slice(i, i + BATCH))
    .onConflictDoUpdate({
      target: places.id,
      set: {
        name: sql`excluded.name`,
        asciiName: sql`excluded.ascii_name`,
        state: sql`excluded.state`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        population: sql`excluded.population`,
      },
    });
}
await close();
console.log(`Loaded ${rows.length} places.`);
