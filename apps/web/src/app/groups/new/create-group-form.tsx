"use client";

import {
  CATEGORY_LABELS,
  GROUP_ACCENTS,
  GROUP_CATEGORIES,
  slugify,
  type CommentPolicy,
  type CreateGroupInput,
  type GroupVisibility,
  type JoinPolicy,
  type PostPolicy,
} from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cx, Field, Input, Select, Textarea } from "@/components/ui";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

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

export function CreateGroupForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const create = useMutation(trpc.group.create.mutationOptions());

  const [slugTouched, setSlugTouched] = useState(false);
  const [form, setForm] = useState<CreateGroupInput>({
    name: "",
    slug: "",
    description: "",
    rules: "",
    category: "neighborhood",
    accentColor: GROUP_ACCENTS[0],
    visibility: "public",
    joinPolicy: "open",
    postPolicy: "members",
    commentPolicy: "members",
  });

  const set = <K extends keyof CreateGroupInput>(key: K, value: CreateGroupInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const errors = fieldErrors(create.error);

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(form, {
          onSuccess: (group) => {
            router.push(`/g/${group.slug}`);
            router.refresh();
          },
        });
      }}
    >
      <section className="space-y-4">
        <Field label="Group name" error={errors.name}>
          <Input
            required
            value={form.name}
            placeholder="Riverside Community Garden"
            onChange={(e) => {
              const name = e.target.value;
              setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
            }}
          />
        </Field>

        <Field label="Web address" hint={`communityspaces.app/g/${form.slug || "your-group"}`} error={errors.slug}>
          <Input
            required
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value.toLowerCase());
            }}
          />
        </Field>

        <Field label="What's this group about?" error={errors.description}>
          <Textarea
            value={form.description}
            placeholder="Who it's for, where you meet, what people post about."
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field label="Group rules" hint="Shown on the About tab. Optional." error={errors.rules}>
          <Textarea value={form.rules} onChange={(e) => set("rules", e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select
              value={form.category}
              onChange={(e) => set("category", e.target.value as CreateGroupInput["category"])}
            >
              {GROUP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Accent color</span>
            <div className="flex gap-2 py-1">
              {GROUP_ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Accent ${color}`}
                  aria-pressed={form.accentColor === color}
                  onClick={() => set("accentColor", color)}
                  className={cx(
                    "size-8 rounded-full ring-offset-2 ring-offset-bg transition",
                    form.accentColor === color ? "ring-2 ring-fg" : "hover:scale-110",
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
          value={form.visibility}
          onChange={(v) =>
            setForm((f) => ({ ...f, visibility: v, joinPolicy: v === "hidden" ? "invite" : f.joinPolicy }))
          }
        />
        <OptionGroup
          label="Who can join"
          options={joinOptions}
          value={form.joinPolicy}
          disabled={form.visibility === "hidden" ? ["open", "request"] : []}
          error={errors.joinPolicy}
          onChange={(v) => set("joinPolicy", v)}
        />
        <OptionGroup label="Who can post" options={postOptions} value={form.postPolicy} onChange={(v) => set("postPolicy", v)} />
        <OptionGroup
          label="Who can comment"
          options={commentOptions}
          value={form.commentPolicy}
          onChange={(v) => set("commentPolicy", v)}
        />
      </section>

      {create.error ? <p className="text-sm text-danger">{errorMessage(create.error)}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create group"}
        </Button>
      </div>
    </form>
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
