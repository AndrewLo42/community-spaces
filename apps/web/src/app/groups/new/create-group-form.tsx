"use client";

import { GROUP_ACCENTS, slugify, type CreateGroupInput } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GroupSettingsFields } from "@/components/group-settings-fields";
import { Button, Field, Input, cx } from "@/components/ui";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

/** Typing into the link: lowercase, spaces become dashes, anything else a link can't hold is dropped. */
function cleanSlug(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

/** Pasting a website here is the usual mix-up: this field names the group's page, it isn't a link to elsewhere. */
const looksLikeUrl = (raw: string) => /:\/\/|^www\.|\.(com|org|net|io|app|co|us)\b/i.test(raw.trim());

export function CreateGroupForm({ host }: { host: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const create = useMutation(trpc.group.create.mutationOptions());

  const [slugTouched, setSlugTouched] = useState(false);
  const [pastedUrl, setPastedUrl] = useState(false);
  const [form, setForm] = useState<CreateGroupInput>({
    name: "",
    slug: "",
    description: "",
    rules: "",
    tags: [],
    accentColor: GROUP_ACCENTS[0],
    visibility: "public",
    joinPolicy: "open",
    postPolicy: "members",
    commentPolicy: "members",
    eventPolicy: "members",
    placeId: null,
  });

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
      <GroupSettingsFields
        value={form}
        errors={errors}
        onChange={(next) =>
          setForm(next.name !== form.name && !slugTouched ? { ...next, slug: slugify(next.name) } : next)
        }
        afterName={
          <div className="space-y-1.5">
            <Field label="Group link" error={errors.slug}>
              {/* The fixed part sits inside the box, so it reads as the end of this site's link, not a place for any URL. */}
              <div className="flex items-center rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-accent/40">
                <span className="shrink-0 select-none py-2 pl-3 text-sm text-muted">
                  {host ? <span className="hidden sm:inline">{host}</span> : null}/g/
                </span>
                <Input
                  required
                  value={form.slug}
                  placeholder="your-group"
                  aria-describedby="group-link-help"
                  className="rounded-l-none border-0 pl-0.5 focus:ring-0"
                  onChange={(e) => {
                    // A pasted website would turn into a garbled link, so keep what was there and explain instead.
                    const isUrl = looksLikeUrl(e.target.value);
                    setPastedUrl(isUrl);
                    if (isUrl) return;
                    setSlugTouched(true);
                    setForm({ ...form, slug: cleanSlug(e.target.value) });
                  }}
                  // A dash is fine mid-word while typing, but a link can't end with one.
                  onBlur={() => setForm({ ...form, slug: form.slug.replace(/-+$/, "") })}
                />
              </div>
            </Field>
            {pastedUrl ? (
              <p role="status" className="text-xs text-danger">
                This is your group's own link on Community Spaces, not a link to another website. To share a website, add it
                to the description.
              </p>
            ) : null}
            <p id="group-link-help" className={cx("text-xs text-muted", errors.slug && "hidden")}>
              Your group's page will be at{" "}
              <span className="font-medium text-fg">
                {host}/g/{form.slug || "your-group"}
              </span>
              . It's made from the name; you can edit it now, but not after the group is created.
            </p>
          </div>
        }
      />

      {create.error ? <p className="text-sm text-danger">{errorMessage(create.error)}</p> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create group"}
        </Button>
      </div>
    </form>
  );
}
