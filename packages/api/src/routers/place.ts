import { parsePlaceQuery, placeIdSchema, placeLabel, placeSearchInput } from "@cs/core";
import { and, desc, eq, places, sql } from "@cs/db";
import { z } from "zod";
import { getPlace } from "../lib/places";
import { prefixPattern } from "../lib/search";
import { publicProcedure, router } from "../trpc";

export const placeRouter = router({
  /** Town suggestions as someone types: "port" or "portland, or". Bigger towns first. */
  search: publicProcedure.input(placeSearchInput).query(async ({ ctx, input }) => {
    const { town, state } = parsePlaceQuery(input.query);
    if (town.length < 2) return [];
    const rows = await ctx.db
      .select({ id: places.id, name: places.name, state: places.state })
      .from(places)
      .where(
        and(
          sql`lower(${places.asciiName}) like ${prefixPattern(town)}`,
          state ? eq(places.state, state) : undefined,
        ),
      )
      .orderBy(desc(places.population))
      .limit(8);
    return rows.map((p) => ({ ...p, label: placeLabel(p) }));
  }),

  byId: publicProcedure.input(z.object({ id: placeIdSchema })).query(({ ctx, input }) => getPlace(ctx.db, input.id)),
});
