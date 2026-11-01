"use client";

import {
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
  POLL_DURATIONS_DAYS,
  type AnnouncementAudience,
} from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Dialog } from "./dialog";
import { Button, Field, Input, Select } from "./ui";

const durationLabel = (days: number) => (days === 7 ? "In a week" : days === 1 ? "In a day" : `In ${days} days`);

/** Asks a group's members, or an event's attendees, a question with a few choices. */
export function NewPollButton({
  audience,
  label = "New poll",
  variant = "secondary",
}: {
  audience: AnnouncementAudience;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <NewPollDialog audience={audience} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NewPollDialog({ audience, onClose }: { audience: AnnouncementAudience; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(Array(MIN_POLL_OPTIONS).fill(""));
  const [multiple, setMultiple] = useState(false);
  const [closesIn, setClosesIn] = useState<string>("3");
  const create = useMutation(
    trpc.poll.create.mutationOptions({
      onSuccess: () => {
        onClose();
        router.refresh();
      },
    }),
  );
  const isEvent = "eventId" in audience;
  const filled = options.filter((o) => o.trim()).length;

  return (
    <Dialog title={isEvent ? "Ask the people coming" : "Start a poll"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ ...audience, question, options, multiple, closesInDays: closesIn ? Number(closesIn) : null });
        }}
      >
        <Field label="Question">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={isEvent ? "What should we bring?" : "Which night works best for meetups?"}
            maxLength={MAX_POLL_QUESTION_LENGTH}
            autoFocus
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Choices</legend>
          {options.map((option, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={option}
                onChange={(e) => setOptions((current) => current.map((o, j) => (j === i ? e.target.value : o)))}
                placeholder={`Choice ${i + 1}`}
                maxLength={MAX_POLL_OPTION_LENGTH}
                aria-label={`Choice ${i + 1}`}
                // Only rows added with "Add a choice" mount after the dialog opens, so this focuses the new one.
                autoFocus={i >= MIN_POLL_OPTIONS}
              />
              {options.length > MIN_POLL_OPTIONS ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="px-3"
                  aria-label={`Remove choice ${i + 1}`}
                  onClick={() => setOptions((current) => current.filter((_, j) => j !== i))}
                >
                  ×
                </Button>
              ) : null}
            </div>
          ))}
          {options.length < MAX_POLL_OPTIONS ? (
            <Button type="button" variant="ghost" className="px-2 text-accent" onClick={() => setOptions((current) => [...current, ""])}>
              + Add a choice
            </Button>
          ) : null}
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-[var(--accent)]" />
          Let people pick more than one
        </label>

        <Field label="Voting ends">
          <Select value={closesIn} onChange={(e) => setClosesIn(e.target.value)}>
            {POLL_DURATIONS_DAYS.map((d) => (
              <option key={d} value={String(d)}>
                {durationLabel(d)}
              </option>
            ))}
            <option value="">When I close it</option>
          </Select>
        </Field>

        <p className="text-xs text-muted">
          {isEvent ? "People who said going or maybe" : "Everyone in the group"} gets a notification in the app. Results show once
          they've voted.
        </p>
        {create.error ? <p className="text-sm text-danger">{errorMessage(create.error)}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!question.trim() || filled < MIN_POLL_OPTIONS || create.isPending}>
            {create.isPending ? "Posting…" : "Post poll"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
