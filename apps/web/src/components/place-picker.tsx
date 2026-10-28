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
 */
export function PlacePicker({
  value,
  onChange,
  name,
  placeholder = "Start typing a town…",
  ariaLabel = "Town",
}: {
  value: PlaceSummary | null;
  onChange: (place: PlaceSummary | null) => void;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const trpc = useTRPC();
  const listId = useId();
  const [text, setText] = useState(value ? placeLabel(value) : "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState("");

  // Keep the box in sync when the chosen place changes from outside.
  useEffect(() => setText(value ? placeLabel(value) : ""), [value]);

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);

  const typing = open && query.length >= 2 && query !== (value ? placeLabel(value) : "");
  const { data: suggestions = [], isFetching } = useQuery(
    trpc.place.search.queryOptions({ query: query || "x" }, { enabled: typing, staleTime: 60_000 }),
  );
  const shown = typing ? suggestions : [];

  function choose(place: PlaceSummary | null) {
    onChange(place);
    setText(place ? placeLabel(place) : "");
    setOpen(false);
  }

  return (
    <div className="relative">
      {name ? <input type="hidden" name={name} value={value?.id ?? ""} /> : null}
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown[highlight] ? `${listId}-${shown[highlight]!.id}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 pr-8 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (!e.target.value.trim()) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Typed text that wasn't picked from the list snaps back to the saved choice.
          setOpen(false);
          setText(value ? placeLabel(value) : "");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && shown.length) {
            e.preventDefault();
            setHighlight((h) => (h + 1) % shown.length);
          } else if (e.key === "ArrowUp" && shown.length) {
            e.preventDefault();
            setHighlight((h) => (h - 1 + shown.length) % shown.length);
          } else if (e.key === "Enter" && shown[highlight]) {
            e.preventDefault();
            choose(shown[highlight]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {value ? (
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
      {typing ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {shown.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${p.id}`}
              role="option"
              aria-selected={i === highlight}
              className={cx("cursor-pointer px-3 py-2 text-sm", i === highlight && "bg-surface-2")}
              // mousedown, so the input's blur doesn't close the list before the click lands
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {p.label}
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{isFetching ? "Searching…" : "No US towns match"}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
