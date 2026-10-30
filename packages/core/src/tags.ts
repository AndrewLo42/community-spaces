// Group hashtags. Owners describe their group in their own words (#gardening,
// #trail-running) instead of picking from a fixed category list. Tags are
// stored normalized, so "#Trail Running", "trail_running" and "TrailRunning"
// can't split one topic into three.

export const MAX_GROUP_TAGS = 5;
export const MIN_TAG_LENGTH = 2;
export const MAX_TAG_LENGTH = 30;

/** Lowercase letters and digits, single dashes between words: "trail-running". */
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Turns what someone typed into a stored tag, or null if nothing usable is
 * left: "#Trail Running!" → "trail-running", "  ##" → null. Accents are
 * folded ("café" → "cafe") so search matches either spelling.
 */
export function normalizeTag(input: string): string | null {
  const tag = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH)
    .replace(/-+$/, "");
  return tag.length >= MIN_TAG_LENGTH ? tag : null;
}

/** Normalizes, drops blanks and duplicates, keeps the first MAX_GROUP_TAGS in order. */
export function cleanTags(inputs: string[]): string[] {
  const out: string[] = [];
  for (const input of inputs) {
    const tag = normalizeTag(input);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_GROUP_TAGS) break;
  }
  return out;
}

/** "#gardening" */
export function tagLabel(tag: string): string {
  return `#${tag}`;
}
