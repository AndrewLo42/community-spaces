"use client";

import { MAX_GROUP_TAGS, normalizeTag, tagLabel } from "@cs/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { cx } from "./ui";

/**
 * Hashtag chips. Type a tag and press Enter or comma to add it;
 * Backspace on an empty box removes the last one. Suggestions come from tags
 * other groups already use, so "#running" doesn't end up as five spellings.
 */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const trpc = useTRPC();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [prefix, setPrefix] = useState("");
  const full = value.length >= MAX_GROUP_TAGS;

  useEffect(() => {
    const t = setTimeout(() => setPrefix(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);

  const { data = [] } = useQuery(
    trpc.tag.suggest.queryOptions({ prefix: prefix || "x" }, { enabled: open && prefix.length > 0, staleTime: 60_000 }),
  );
  const suggestions = open && prefix ? data.filter((s) => !value.includes(s.tag)).slice(0, 6) : [];
  const preview = normalizeTag(text);

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (tag && !value.includes(tag) && !full) onChange([...value, tag]);
    setText("");
    setHighlight(-1);
  }

  return (
    <div className="relative">
      <div
        className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent/40"
        onClick={() => input.current?.focus()}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-sm">
            {tagLabel(tag)}
            <button
              type="button"
              aria-label={`Remove ${tagLabel(tag)}`}
              className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-line hover:text-fg"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((t) => t !== tag));
              }}
            >
              ×
            </button>
          </span>
        ))}
        {!full ? (
          <input
            ref={input}
            value={text}
            role="combobox"
            aria-label="Add a hashtag"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlight >= 0 && suggestions[highlight] ? `${listId}-${highlight}` : undefined}
            placeholder={value.length === 0 ? "#gardening, #trail-running…" : "Add another"}
            className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-fg placeholder:text-muted focus:outline-none"
            onChange={(e) => {
              const next = e.target.value;
              // A comma commits what's before it. Spaces don't: "book club" becomes #book-club.
              if (next.endsWith(",") && next.trim() !== ",") return add(next.slice(0, -1));
              setText(next);
              setOpen(true);
              setHighlight(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              if (text.trim()) add(text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(highlight >= 0 && suggestions[highlight] ? suggestions[highlight]!.tag : text);
              } else if (e.key === "Backspace" && !text && value.length > 0) {
                onChange(value.slice(0, -1));
              } else if (e.key === "ArrowDown" && suggestions.length) {
                e.preventDefault();
                setHighlight((h) => (h + 1) % suggestions.length);
              } else if (e.key === "ArrowUp" && suggestions.length) {
                e.preventDefault();
                setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
        ) : null}
      </div>

      <p className="mt-1 text-xs text-muted">
        {full
          ? `That's the maximum of ${MAX_GROUP_TAGS}.`
          : text && preview && preview !== text.replace(/^#/, "")
            ? `Will be added as ${tagLabel(preview)}`
            : `Up to ${MAX_GROUP_TAGS}. Press Enter or comma after each one.`}
      </p>

      {suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={cx("flex cursor-pointer justify-between px-3 py-2 text-sm", i === highlight && "bg-surface-2")}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.tag);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span>{tagLabel(s.tag)}</span>
              <span className="text-xs text-muted">
                {s.groups} {s.groups === 1 ? "group" : "groups"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
