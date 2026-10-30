import { normalizeTag, tagSuggestInput } from "@cs/core";
import { groups, ne, sql } from "@cs/db";
import { prefixPattern } from "../lib/search";
import { publicProcedure, router } from "../trpc";

// Hashtags across all discoverable groups, ranked by how many groups use them.
// At community scale this is a small aggregate; if it grows, a tag-count table
// maintained on group save would replace it.

function tagCounts(prefix: string, limit: number) {
  return sql<{ tag: string; groups: number }>`
    select t.tag, count(*)::int as groups
    from ${groups}, unnest(${groups.tags}) as t(tag)
    where ${ne(groups.visibility, "hidden")} and t.tag like ${prefixPattern(prefix)}
    group by t.tag
    order by groups desc, t.tag
    limit ${limit}
  `;
}

export const tagRouter = router({
  /** Existing tags to offer while someone types (group settings and the Discover box), most used first. */
  suggest: publicProcedure.input(tagSuggestInput).query(async ({ ctx, input }) => {
    // normalizeTag needs two characters; for one-letter prefixes, the letter itself is enough.
    const typed = input.prefix.replace(/^#+/, "").toLowerCase();
    const prefix = normalizeTag(typed) ?? (/^[a-z0-9]$/.test(typed) ? typed : null);
    if (!prefix) return [];
    const rows = await ctx.db.execute<{ tag: string; groups: number }>(tagCounts(prefix, 8));
    return [...rows];
  }),
});
