"use client";

import { MAX_EVENT_CAPACITY } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Button, ButtonLink, Field, Input, Textarea } from "./ui";

export interface EventFormValues {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  link: string;
  capacity: string;
}

const blank: EventFormValues = { title: "", description: "", date: "", startTime: "", endTime: "", location: "", link: "", capacity: "" };

/** "PST" for a zone on the chosen day (noon, so a DST switch that morning doesn't matter), or today. */
function zoneAbbreviation(timeZone: string, date: string) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date();
  return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(day).find((p) => p.type === "timeZoneName")
    ?.value;
}

/**
 * Plan or edit an event. New events use the planner's own time zone; edits
 * keep the zone the event was planned in, so its times don't shift.
 */
export function EventForm(
  props:
    | { mode: "create"; groupId: string; cancelHref: string }
    | { mode: "edit"; eventId: string; timeZone: string; initial: EventFormValues; cancelHref: string },
) {
  const trpc = useTRPC();
  const router = useRouter();
  const [values, setValues] = useState(props.mode === "edit" ? props.initial : blank);
  const [timeZone] = useState(() => (props.mode === "edit" ? props.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone));
  const create = useMutation(trpc.event.create.mutationOptions());
  const update = useMutation(trpc.event.update.mutationOptions());
  const mutation = props.mode === "create" ? create : update;
  const errors = fieldErrors(mutation.error);
  const set = (key: keyof EventFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const today = new Date().toLocaleDateString("en-CA");

  function submit() {
    const fields = {
      ...values,
      timeZone,
      capacity: values.capacity.trim() ? Number(values.capacity) : null,
    };
    const onSuccess = ({ id }: { id: string }) => {
      router.push(`/e/${id}`);
      router.refresh();
    };
    if (props.mode === "create") create.mutate({ groupId: props.groupId, ...fields }, { onSuccess });
    else update.mutate({ eventId: props.eventId, ...fields }, { onSuccess });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="What's happening" error={errors.title}>
        <Input value={values.title} onChange={set("title")} placeholder="Saturday work day, Book swap, Group run…" required maxLength={120} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" error={errors.date}>
          <Input type="date" value={values.date} onChange={set("date")} min={props.mode === "create" ? today : undefined} required />
        </Field>
        <Field label="Starts" error={errors.startTime}>
          <Input type="time" value={values.startTime} onChange={set("startTime")} required />
        </Field>
        <Field label="Ends (optional)" error={errors.endTime} hint={values.endTime && values.endTime <= values.startTime ? "Ends the next day" : undefined}>
          <Input type="time" value={values.endTime} onChange={set("endTime")} />
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted">
        Times are {zoneAbbreviation(timeZone, values.date)} ({timeZone.replace(/_/g, " ")}). Everyone sees them in this time zone.
      </p>

      <Field label="Where" hint="A place name or address. Leave blank if it's online." error={errors.location}>
        <Input value={values.location} onChange={set("location")} placeholder="Riverside garden shed, 1200 SE Oak St" maxLength={200} />
      </Field>

      <Field label="Link (optional)" hint="A map, video call or ticket page." error={errors.link}>
        <Input type="url" value={values.link} onChange={set("link")} placeholder="https://" maxLength={500} />
      </Field>

      <Field label="Spots (optional)" hint="Leave blank for no limit. Once it's full, people can still say maybe." error={errors.capacity}>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_EVENT_CAPACITY}
          value={values.capacity}
          onChange={set("capacity")}
          className="sm:w-32"
        />
      </Field>

      <Field label="Details" error={errors.description}>
        <Textarea
          value={values.description}
          onChange={set("description")}
          placeholder="What to bring, where to find the group, who it's for…"
          className="min-h-32"
          maxLength={5000}
        />
      </Field>

      {mutation.error ? <p className="text-sm text-danger">{errorMessage(mutation.error)}</p> : null}

      {props.mode === "edit" ? (
        <p className="text-xs text-muted">If you change the time or place, everyone who said they're coming gets a notification and an email.</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <ButtonLink href={props.cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={mutation.isPending}>
          {props.mode === "create" ? (mutation.isPending ? "Planning…" : "Plan event") : mutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
