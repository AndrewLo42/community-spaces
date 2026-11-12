"use client";

import { placeLabel, type PlaceSummary } from "@cs/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { cx } from "./ui";

/**
 * Town autocomplete over the built-in US places list. Typing "port" or
 * "portland, or" suggests towns, biggest first; only a suggestion can be
 * chosen, so every saved location is a real place with coordinates.
 * `name` adds a hidden input with the place id, for plain GET forms.
 *
 * `presets` are fixed choices offered before anything is typed (Discover's
 * "Online" and "Anywhere"). The chosen one is `preset`, shown in the box when
 * no town is picked; `emptyPreset` is the one clearing the box falls back to.
 */
export type PlacePreset = { key: string; label: string; hint?: string };

export function PlacePicker({
  value,
  onChange,
  name,
  placeholder = "Start typing a town…",
  ariaLabel = "Town",
  presets,
  preset = null,
  onPreset,
  emptyPreset,
}: {
  value: PlaceSummary | null;
  onChange: (place: PlaceSummary | null) => void;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  presets?: PlacePreset[];
  preset?: string | null;
  onPreset?: (key: string) => void;
  emptyPreset?: string;
}) {
  const trpc = useTRPC();
  const listId = useId();
  const shownLabel = value ? placeLabel(value) : (presets?.find((p) => p.key === preset)?.label ?? "");
  const [text, setText] = useState(shownLabel);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState("");

  // Keep the box in sync when the chosen place changes from outside.
  useEffect(() => setText(shownLabel), [shownLabel]);

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);

  const typing = open && query.length >= 2 && query !== shownLabel;
  const { data: suggestions = [], isFetching } = useQuery(
    trpc.place.search.queryOptions({ query: query || "x" }, { enabled: typing, staleTime: 60_000 }),
  );
  const shown = typing ? suggestions : [];
  // Before anything is typed (or once the box is cleared), offer the presets.
  const offered = open && !typing ? (presets ?? []) : [];
  type Item = { kind: "place"; place: (typeof suggestions)[number] } | { kind: "preset"; preset: PlacePreset };
  const items: Item[] = typing
    ? shown.map((place) => ({ kind: "place", place }))
    : offered.map((p) => ({ kind: "preset", preset: p }));
  const itemId = (item: Item) => `${listId}-${item.kind === "place" ? item.place.id : item.preset.key}`;

  function choose(place: PlaceSummary | null) {
    onChange(place);
    if (!place && emptyPreset) onPreset?.(emptyPreset);
    setText(place ? placeLabel(place) : (presets?.find((p) => p.key === emptyPreset)?.label ?? ""));
    setOpen(false);
  }

  function pick(item: Item) {
    if (item.kind === "place") return choose(item.place);
    onChange(null);
    onPreset?.(item.preset.key);
    setText(item.preset.label);
    setOpen(false);
  }

  const clearable = value !== null || (preset !== null && preset !== emptyPreset);

  return (
    <div className="relative">
      {name ? <input type="hidden" name={name} value={value?.id ?? ""} /> : null}
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={items.length > 0 || typing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={items[highlight] ? itemId(items[highlight]!) : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 pr-8 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (!e.target.value.trim() && value) onChange(null);
        }}
        onFocus={(e) => {
          setOpen(true);
          setHighlight(0);
          // Typing replaces the current choice rather than adding to it.
          if (presets) e.target.select();
        }}
        onClick={(e) => {
          // Clicking back into a box that kept focus after a pick: reopen and select, as on focus.
          if (!presets || open) return;
          setOpen(true);
          setHighlight(0);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setOpen(false);
          // A cleared box falls back to the empty preset; other typing that wasn't picked snaps back.
          if (!text.trim() && !value && emptyPreset) {
            onPreset?.(emptyPreset);
            setText(presets?.find((p) => p.key === emptyPreset)?.label ?? "");
          } else {
            setText(shownLabel);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && items.length) {
            e.preventDefault();
            setHighlight((h) => (h + 1) % items.length);
          } else if (e.key === "ArrowUp" && items.length) {
            e.preventDefault();
            setHighlight((h) => (h - 1 + items.length) % items.length);
          } else if (e.key === "Enter" && items[highlight]) {
            e.preventDefault();
            pick(items[highlight]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {clearable ? (
        <button
          type="button"
          aria-label="Clear location"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-muted hover:text-fg"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(null)}
        >
          ×
        </button>
      ) : null}
      {items.length > 0 || typing ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {items.map((item, i) => (
            <li
              key={itemId(item)}
              id={itemId(item)}
              role="option"
              aria-selected={i === highlight}
              className={cx("cursor-pointer px-3 py-2 text-sm", i === highlight && "bg-surface-2")}
              // mousedown, so the input's blur doesn't close the list before the click lands
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {item.kind === "place" ? (
                item.place.label
              ) : (
                <>
                  <span className={cx(item.preset.key === preset && !value && "font-medium")}>{item.preset.label}</span>
                  {item.preset.hint ? <span className="block text-xs text-muted">{item.preset.hint}</span> : null}
                </>
              )}
            </li>
          ))}
          {typing && shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{isFetching ? "Searching…" : "No US towns match"}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
