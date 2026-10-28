/** A `%…%` ILIKE pattern that treats the user's text literally (no `%` or `_` wildcards). */
export function containsPattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, "\\$&")}%`;
}

/** A `…%` ILIKE/LIKE pattern matching anything that starts with the user's text. */
export function prefixPattern(query: string): string {
  return `${query.replace(/[%_\\]/g, "\\$&")}%`;
}
