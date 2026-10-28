/** A `%…%` ILIKE pattern that treats the user's text literally (no `%` or `_` wildcards). */
export function containsPattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, "\\$&")}%`;
}
