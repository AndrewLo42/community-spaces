import type { PlaceSummary } from "@cs/core";
import { eq, places, type Db } from "@cs/db";
import { TRPCError } from "@trpc/server";

export async function getPlace(db: Db, id: number | null | undefined): Promise<PlaceSummary | null> {
  if (!id) return null;
  const [place] = await db
    .select({ id: places.id, name: places.name, state: places.state })
    .from(places)
    .where(eq(places.id, id));
  return place ?? null;
}

/** Rejects ids that aren't in the places table (rather than failing on the foreign key). */
export async function assertPlace(db: Db, id: number | null | undefined): Promise<void> {
  if (id && !(await getPlace(db, id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a town from the list" });
}

/** Rows joined with places come back as three nullable columns; fold them into one object. */
export function foldPlace<T extends { placeId: number | null; placeName: string | null; placeState: string | null }>(
  row: T,
) {
  const { placeId, placeName, placeState, ...rest } = row;
  return {
    ...rest,
    place: placeId && placeName && placeState ? { id: placeId, name: placeName, state: placeState } : null,
  };
}
