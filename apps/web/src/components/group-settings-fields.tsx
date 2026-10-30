"use client";

import {
  GROUP_ACCENTS,
  type CommentPolicy,
  type EventPolicy,
  type CreateGroupInput,
  type GroupVisibility,
  type JoinPolicy,
  type PlaceSummary,
  type PostPolicy,
} from "@cs/core";
import { useState } from "react";
import { PlacePicker } from "./place-picker";
import { TagInput } from "./tag-input";
import { cx, Field, Input, Textarea } from "./ui";

/** Everything about a group except its address. Shared by create and settings. */
export type GroupSettings = Omit<CreateGroupInput, "slug">;

interface Option<T extends string> {
  value: T;
  label: string;
  description: string;
}

const visibilityOptions: Option<GroupVisibility>[] = [
  { value: "public", label: "Public", description: "Anyone can find it and read posts." },
  { value: "private", label: "Private", description: "Anyone can find it; only members read posts." },
  { value: "hidden", label: "Hidden", description: "Unlisted. Members join by invite only." },
];

const joinOptions: Option<JoinPolicy>[] = [
  { value: "open", label: "Anyone can join", description: "One click to join." },
  { value: "request", label: "Approve requests", description: "Admins and moderators approve each member." },
  { value: "invite", label: "Invite only", description: "Only people with an invite link can join." },
];

const postOptions: Option<PostPolicy>[] = [
  { value: "members", label: "All members", description: "Any member can post." },
  { value: "approval", label: "Members, with approval", description: "Posts wait for a moderator to approve." },
  { value: "admins", label: "Admins only", description: "Announcement style. Members can still comment." },
];

const commentOptions: Option<CommentPolicy>[] = [
  { value: "members", label: "All members", description: "Any member can comment." },
  { value: "admins", label: "Admins only", description: "Comments are limited to admins." },
];

const eventOptions: Option<EventPolicy>[] = [
  { value: "members", label: "All members", description: "Any member can put a meetup on the calendar." },
  { value: "admins", label: "Admins only", description: "Admins and the owner plan events; members RSVP." },
];

export function GroupSettingsFields<T extends GroupSettings>({
  value,
  onChange,
  errors,
  afterName,
  initialPlace = null,
}: {
  value: T;
  onChange: (next: T) => void;
  errors: Record<string, string | undefined>;
  /** Slot under the name field (the create form puts the web address here). */
  afterName?: React.ReactNode;
  /** The saved location, so the picker can show its name. */
  initialPlace?: PlaceSummary | null;
}) {
  const set = <K extends keyof GroupSettings>(key: K, v: T[K]) => onChange({ ...value, [key]: v });
  const [place, setPlace] = useState<PlaceSummary | null>(initialPlace);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Field label="Group name" error={errors.name}>
          <Input required value={value.name} placeholder="Riverside Community Garden" onChange={(e) => set("name", e.target.value)} />
        </Field>

        {afterName}

        <Field label="What's this group about?" error={errors.description}>
          <Textarea
            value={value.description}
            placeholder="Who it's for, where you meet, what people post about."
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field label="Group rules" hint="Shown on the About tab. Optional." error={errors.rules}>
          <Textarea value={value.rules} onChange={(e) => set("rules", e.target.value)} />
        </Field>

        <Field
          label="Where does the group meet?"
          hint="Helps neighbors find you. Leave empty for online-only groups."
          error={errors.placeId}
        >
          <PlacePicker
            value={place}
            ariaLabel="Group location"
            onChange={(p) => {
              setPlace(p);
              set("placeId", p?.id ?? null);
            }}
          />
        </Field>

        {/* Not a <label>: the chips inside have their own buttons. */}
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Hashtags</span>
          <TagInput value={value.tags} onChange={(tags) => set("tags", tags)} />
          {errors.tags ? <span className="block text-xs text-danger">{errors.tags}</span> : null}
        </div>

        <div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Accent color</span>
            <div className="flex gap-2 py-1">
              {GROUP_ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Accent ${color}`}
                  aria-pressed={value.accentColor === color}
                  onClick={() => set("accentColor", color)}
                  className={cx(
                    "size-8 rounded-full ring-offset-2 ring-offset-bg transition",
                    value.accentColor === color ? "ring-2 ring-fg" : "hover:scale-110",
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6 border-t border-line pt-6">
        <h2 className="font-serif text-xl font-semibold">Who can do what</h2>
        <OptionGroup
          label="Who can see it"
          options={visibilityOptions}
          value={value.visibility}
          onChange={(v) => onChange({ ...value, visibility: v, joinPolicy: v === "hidden" ? "invite" : value.joinPolicy })}
        />
        <OptionGroup
          label="Who can join"
          options={joinOptions}
          value={value.joinPolicy}
          disabled={value.visibility === "hidden" ? ["open", "request"] : []}
          error={errors.joinPolicy}
          onChange={(v) => set("joinPolicy", v)}
        />
        <OptionGroup label="Who can post" options={postOptions} value={value.postPolicy} onChange={(v) => set("postPolicy", v)} />
        <OptionGroup
          label="Who can comment"
          options={commentOptions}
          value={value.commentPolicy}
          onChange={(v) => set("commentPolicy", v)}
        />
        <OptionGroup label="Who can plan events" options={eventOptions} value={value.eventPolicy} onChange={(v) => set("eventPolicy", v)} />
      </section>
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = [],
  error,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: T[];
  error?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const isDisabled = disabled.includes(o.value);
          return (
            <label
              key={o.value}
              className={cx(
                "cursor-pointer rounded-lg border p-3 text-sm transition",
                value === o.value ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line bg-surface",
                isDisabled && "pointer-events-none opacity-40",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                checked={value === o.value}
                disabled={isDisabled}
                onChange={() => onChange(o.value)}
              />
              <span className="block font-medium">{o.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{o.description}</span>
            </label>
          );
        })}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </fieldset>
  );
}
