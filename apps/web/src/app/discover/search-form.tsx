"use client";

import { RADIUS_OPTIONS_MILES, type PlaceSummary, type RadiusMiles } from "@cs/core";
import { useState } from "react";
import { PlacePicker, type PlacePreset } from "@/components/place-picker";
import { Button, Select } from "@/components/ui";
import { DiscoverSearchBox } from "./search-box";

/** Where Discover looks when no town is picked. */
export type DiscoverScope = "online" | "any";

const PRESETS: PlacePreset[] = [
  { key: "online", label: "Online", hint: "Groups that don't meet in a town" },
  { key: "any", label: "Anywhere", hint: "Every group, local and online" },
];

/**
 * A plain GET form, so results are shareable URLs. The location box takes a
 * town, or one of the presets: near=online or near=any. Clearing the box means
 * anywhere rather than "fall back to my hometown".
 */
export function DiscoverSearchForm({
  query,
  near,
  scope,
  radius,
}: {
  query?: string;
  near: PlaceSummary | null;
  scope: DiscoverScope;
  radius: RadiusMiles;
}) {
  const [place, setPlace] = useState(near);
  const [where, setWhere] = useState<DiscoverScope>(scope);

  return (
    <form action="/discover" className="grid gap-2 sm:grid-cols-[1fr_14rem_auto_auto]">
      <DiscoverSearchBox defaultValue={query} />
      <PlacePicker
        value={place}
        onChange={setPlace}
        presets={PRESETS}
        preset={place ? null : where}
        onPreset={(key) => setWhere(key as DiscoverScope)}
        emptyPreset="any"
        placeholder="Town, Online or Anywhere"
        ariaLabel="Where"
      />
      <input type="hidden" name="near" value={place?.id ?? where} />
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
