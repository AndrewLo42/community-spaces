import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanTags, MAX_GROUP_TAGS, normalizeTag, parseSearch, TAG_PATTERN } from "./tags";

describe("tags", () => {
  it("normalizes what people type into one spelling", () => {
    assert.equal(normalizeTag("#Gardening"), "gardening");
    assert.equal(normalizeTag("Trail Running"), "trail-running");
    assert.equal(normalizeTag("trail_running"), "trail-running");
    assert.equal(normalizeTag("##book--club!!"), "book-club");
    assert.equal(normalizeTag("Café"), "cafe");
    assert.equal(normalizeTag("  5k  "), "5k");
  });

  it("rejects tags with nothing usable left", () => {
    assert.equal(normalizeTag("#"), null);
    assert.equal(normalizeTag("a"), null);
    assert.equal(normalizeTag("🌱"), null);
  });

  it("caps length without leaving a trailing dash", () => {
    const tag = normalizeTag("community garden volunteers of the riverside")!;
    assert.ok(tag.length <= 30);
    assert.match(tag, TAG_PATTERN);
  });

  it("dedupes after normalizing and keeps the first few", () => {
    assert.deepEqual(cleanTags(["Gardening", "#gardening", "compost", ""]), ["gardening", "compost"]);
    assert.equal(cleanTags(["aa", "bb", "cc", "dd", "ee", "ff", "gg"]).length, MAX_GROUP_TAGS);
  });

  it("splits a search into hashtag filters and words", () => {
    assert.deepEqual(parseSearch("#Gardening raised beds"), { tags: ["gardening"], text: "raised beds" });
    assert.deepEqual(parseSearch("  books   #book-club #Book-Club "), { tags: ["book-club"], text: "books" });
    assert.deepEqual(parseSearch("# #a running"), { tags: [], text: "running" });
    assert.deepEqual(parseSearch(""), { tags: [], text: "" });
  });
});
