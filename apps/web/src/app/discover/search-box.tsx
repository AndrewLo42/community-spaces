"use client";

import { parseSearch, placeLabel, tagLabel, type PlaceSummary } from "@cs/core";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cx } from "@/components/ui";
import { useTRPC } from "@/trpc/client";

type Option =
  | { kind: "tag"; tag: string; groups: number }
  | { kind: "group"; slug: string; name: string; accentColor: string; place: PlaceSummary | null };

/**
 * The Discover search field. Words search names and descriptions; a word
 * starting with # filters by that hashtag. While typing, a dropdown offers
 * hashtags that start with the word being typed (picking one filters right
 * away) and groups whose names match (picking one opens it).
 */
export function DiscoverSearchBox({ defaultValue }: { defaultValue?: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [typed, setTyped] = useState(text);

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setTyped(text), 150);
    return () => clearTimeout(t);
  }, [text]);

  // The word being typed is the last one, unless a space already ended it.
  const word = /\s$/.test(typed) ? "" : (typed.trim().split(/\s+/).pop() ?? "");
  const tagPrefix = word.replace(/^#+/, "");
  const words = parseSearch(typed).text;
  // Hashtags already in the box (besides the one being typed) aren't offered again.
  const chosenTags = parseSearch(word ? typed.replace(/\S+\s*$/, "") : typed).tags;
  const active = open && typed.trim() !== (defaultValue ?? "").trim();

  const { data: tagRows = [] } = useQuery(
    trpc.tag.suggest.queryOptions({ prefix: tagPrefix || "x" }, { enabled: active && tagPrefix.length > 0, staleTime: 60_000 }),
  );
  const { data: groupRows = [] } = useQuery(
    trpc.group.suggest.queryOptions({ query: typed.trim() || "x" }, { enabled: active && words.length >= 2, staleTime: 30_000 }),
  );

  const tagOptions: Option[] = active && tagPrefix
    ? tagRows.filter((r) => !chosenTags.includes(r.tag)).slice(0, 5).map((r) => ({ kind: "tag", ...r }))
    : [];
  const groupOptions: Option[] = active && words.length >= 2 ? groupRows.map((g) => ({ kind: "group", ...g })) : [];
  // A word starting with # is clearly a hashtag, so those come first; otherwise groups do.
  const options = word.startsWith("#") ? [...tagOptions, ...groupOptions] : [...groupOptions, ...tagOptions];

  function choose(option: Option) {
    setOpen(false);
    if (option.kind === "group") return router.push(`/g/${option.slug}`);
    // Swap the half-typed word for the hashtag and search straight away.
    const rest = text.replace(/\S+$/, "").trimEnd();
    const next = `${rest ? `${rest} ` : ""}${tagLabel(option.tag)}`;
    flushSync(() => setText(next));
    input.current?.form?.requestSubmit();
  }

  return (
    <div className="relative">
      <input
        ref={input}
        name="q"
        type="search"
        role="combobox"
        aria-label="Search groups"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={highlight >= 0 && options[highlight] ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        value={text}
        placeholder="Search groups, or filter with #hashtags"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && options.length) {
            e.preventDefault();
            setHighlight((h) => (h + 1) % options.length);
          } else if (e.key === "ArrowUp" && options.length) {
            e.preventDefault();
            setHighlight((h) => (h <= 0 ? options.length - 1 : h - 1));
          } else if (e.key === "Enter" && highlight >= 0 && options[highlight]) {
            e.preventDefault();
            choose(options[highlight]!);
          } else if (e.key === "Escape" && options.length) {
            e.preventDefault();
            setOpen(false);
          }
        }}
      />

      {options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.kind === "tag" ? `t:${o.tag}` : `g:${o.slug}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={cx("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", i === highlight && "bg-surface-2")}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {o.kind === "tag" ? (
                <>
                  <span className="w-12 shrink-0 text-xs text-muted">Filter</span>
                  <span className="flex-1 font-medium text-accent">{tagLabel(o.tag)}</span>
                  <span className="text-xs text-muted">
                    {o.groups} {o.groups === 1 ? "group" : "groups"}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-12 shrink-0 text-xs text-muted">Group</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.accentColor }} />
                    <span className="truncate">{o.name}</span>
                  </span>
                  {o.place ? <span className="shrink-0 text-xs text-muted">{placeLabel(o.place)}</span> : null}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
