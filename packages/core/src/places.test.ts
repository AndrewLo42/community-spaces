import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundingBox, formatDistance, milesBetween, parsePlaceQuery, placeLabel } from "./places";

const portland = { lat: 45.52345, lng: -122.67621 };
const seattle = { lat: 47.60621, lng: -122.33207 };

describe("places", () => {
  it("labels a place as City, ST", () => {
    assert.equal(placeLabel({ name: "Portland", state: "OR" }), "Portland, OR");
  });

  it("splits a typed query into town and state", () => {
    assert.deepEqual(parsePlaceQuery("Portland"), { town: "portland", state: null });
    assert.deepEqual(parsePlaceQuery("portland, or"), { town: "portland", state: "OR" });
    assert.deepEqual(parsePlaceQuery("Portland, Ore"), { town: "portland", state: "OR" });
    assert.deepEqual(parsePlaceQuery("Springfield, new y"), { town: "springfield", state: "NY" });
    assert.deepEqual(parsePlaceQuery("Springfield, zz"), { town: "springfield", state: null });
  });

  it("measures distance in miles", () => {
    const d = milesBetween(portland, seattle);
    assert.ok(d > 140 && d < 150, `Portland–Seattle should be ~145 mi, got ${d}`);
    assert.equal(milesBetween(portland, portland), 0);
  });

  it("builds a bounding box that contains the radius", () => {
    const box = boundingBox(portland, 25);
    const north = { lat: portland.lat + 25 / 69 - 0.001, lng: portland.lng };
    assert.ok(north.lat < box.maxLat && north.lat > box.minLat);
    assert.ok(seattle.lat > box.maxLat, "Seattle is outside a 25 mi box around Portland");
  });

  it("formats distances", () => {
    assert.equal(formatDistance(0.4), "Under 1 mi");
    assert.equal(formatDistance(12.6), "13 mi");
  });
});
