"use client";

import type { PlaceSummary } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlacePicker } from "@/components/place-picker";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

export function ProfileForm({ initial }: { initial: { name: string; bio: string; place: PlaceSummary | null } }) {
  const router = useRouter();
  const trpc = useTRPC();
  const update = useMutation(trpc.user.updateProfile.mutationOptions({ onSuccess: () => router.refresh() }));
  const [form, setForm] = useState(initial);
  const errors = fieldErrors(update.error);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ name: form.name, bio: form.bio, placeId: form.place?.id ?? null });
      }}
    >
      <Field label="Name" error={errors.name}>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Rivera" />
      </Field>
      <Field
        label="Town"
        hint="Shown next to your name on posts, and used to suggest groups near you."
        error={errors.placeId}
      >
        <PlacePicker value={form.place} onChange={(place) => setForm({ ...form, place })} ariaLabel="Your town" />
      </Field>
      <Field label="Short bio" hint={`${form.bio.length}/280`} error={errors.bio}>
        <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} maxLength={280} />
      </Field>
      <div className="flex items-center justify-end gap-3">
        {update.isSuccess && !update.isPending ? <span className="text-sm text-muted">Saved</span> : null}
        {update.error ? <span className="text-sm text-danger">{errorMessage(update.error)}</span> : null}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
