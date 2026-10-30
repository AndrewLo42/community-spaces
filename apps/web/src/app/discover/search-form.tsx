"use client";

import { RADIUS_OPTIONS_MILES, type PlaceSummary, type RadiusMiles } from "@cs/core";
import { useState } from "react";
import { PlacePicker } from "@/components/place-picker";
import { Button, Select } from "@/components/ui";
import { DiscoverSearchBox } from "./search-box";

/**
 * A plain GET form, so results are shareable URLs. Clearing the town sends
 * near=any, which means "anywhere" rather than "fall back to my hometown".
 */
export function DiscoverSearchForm({
  query,
  near,
  radius,
}: {
  query?: string;
  near: PlaceSummary | null;
  radius: RadiusMiles;
}) {
  const [place, setPlace] = useState(near);

  return (
    <form action="/discover" className="grid gap-2 sm:grid-cols-[1fr_14rem_auto_auto]">
      <DiscoverSearchBox defaultValue={query} />
      <PlacePicker value={place} onChange={setPlace} placeholder="Anywhere" ariaLabel="Near town" />
      <input type="hidden" name="near" value={place?.id ?? "any"} />
      <Select name="radius" defaultValue={String(radius)} aria-label="Distance" className="sm:w-28" disabled={!place}>
        {RADIUS_OPTIONS_MILES.map((r) => (
          <option key={r} value={r}>
            {r} mi
          </option>
        ))}
      </Select>
      <Button type="submit">Search</Button>
    </form>
  );
}
