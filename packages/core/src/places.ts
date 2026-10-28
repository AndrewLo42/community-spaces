// Locations are US towns from the places table. Shared helpers for labels,
// search input and distance, so web, API and (later) mobile agree.

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface PlaceSummary {
  id: number;
  name: string;
  state: string;
}

/** "Portland, OR" */
export function placeLabel(place: Pick<PlaceSummary, "name" | "state">): string {
  return `${place.name}, ${place.state}`;
}

/** Search radii offered in Discover, in miles. */
export const RADIUS_OPTIONS_MILES = [10, 25, 50, 100] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS_MILES)[number];
export const DEFAULT_RADIUS_MILES: RadiusMiles = 25;

/**
 * Splits what someone typed into a town prefix and an optional state:
 * "portland, or" → { town: "portland", state: "OR" }. The state can be the
 * two-letter code or the start of the full name ("port, ore").
 */
export function parsePlaceQuery(input: string): { town: string; state: string | null } {
  const [rawTown = "", rawState = ""] = input.split(",", 2);
  const town = rawTown.trim().toLowerCase();
  const stateText = rawState.trim().toLowerCase();
  if (!stateText) return { town, state: null };
  const byCode = Object.keys(US_STATES).find((code) => code.toLowerCase() === stateText);
  if (byCode) return { town, state: byCode };
  const byName = Object.entries(US_STATES).find(([, name]) => name.toLowerCase().startsWith(stateText));
  return { town, state: byName ? byName[0] : null };
}

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance between two points, in miles. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A lat/lng box that contains every point within `miles`, for a cheap indexed pre-filter. */
export function boundingBox(center: { lat: number; lng: number }, miles: number) {
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
}

/** "Under 1 mi", "3 mi", "42 mi" */
export function formatDistance(miles: number): string {
  return miles < 1 ? "Under 1 mi" : `${Math.round(miles)} mi`;
}
