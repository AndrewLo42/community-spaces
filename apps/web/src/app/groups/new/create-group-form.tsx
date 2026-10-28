"use client";

import { GROUP_ACCENTS, slugify, type CreateGroupInput } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GroupSettingsFields } from "@/components/group-settings-fields";
import { Button, Field, Input } from "@/components/ui";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

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
          <Field label="Web address" hint={`communityspaces.app/g/${form.slug || "your-group"}`} error={errors.slug}>
            <Input
              required
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm({ ...form, slug: e.target.value.toLowerCase() });
              }}
            />
          </Field>
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
