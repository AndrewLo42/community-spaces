"use client";

import type { PollView } from "@cs/api";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { useTRPC } from "@/trpc/client";
import { Avatar } from "./avatar";
import { Dialog } from "./dialog";
import { Button, cx } from "./ui";

const votes = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;
const answers = (n: number) => `${n} ${n === 1 ? "answer" : "answers"}`;

/** Polls for a group or an event, newest first. */
export function PollList({ title, polls }: { title: string; polls: PollView[] }) {
  if (polls.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-accent">{title}</h2>
      {polls.map((p) => (
        <PollCard key={p.id} poll={p} />
      ))}
    </section>
  );
}

/**
 * Choices until you answer, then the results with your picks marked. You can
 * change your answer while the poll is open.
 */
export function PollCard({ poll }: { poll: PollView }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(poll.viewer.votes);
  const [changing, setChanging] = useState(false);
  const vote = useMutation(
    trpc.poll.vote.mutationOptions({
      onSuccess: () => {
        setChanging(false);
        router.refresh();
      },
    }),
  );
  const voting = poll.viewer.canVote && (changing || poll.viewer.votes.length === 0);
  const total = poll.options.reduce((sum, o) => sum + (o.voteCount ?? 0), 0);

  const toggle = (id: string) =>
    setPicked((current) =>
      poll.multiple ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id],
    );

  return (
    <article className="rounded-xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-center gap-2 text-sm">
        <Avatar name={poll.author?.name ?? null} image={poll.author?.image ?? null} size="sm" />
        <span className="font-medium">{poll.author?.name || "Organizer"}</span>
        <span className="text-xs text-muted">asked {timeAgo(poll.createdAt)}</span>
        {poll.viewer.canManage ? <PollMenu poll={poll} /> : null}
      </div>
      <h3 className="mt-2 font-medium">{poll.question}</h3>
      {poll.multiple && voting ? <p className="text-xs text-muted">Choose any that work.</p> : null}

      {voting ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            vote.mutate({ pollId: poll.id, optionIds: picked });
          }}
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">{poll.question}</legend>
            {poll.options.map((o) => (
              <label
                key={o.id}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm transition",
                  picked.includes(o.id) ? "border-accent" : "border-line hover:bg-surface-2",
                )}
              >
                <input
                  type={poll.multiple ? "checkbox" : "radio"}
                  name={`poll-${poll.id}`}
                  checked={picked.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="accent-[var(--accent)]"
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={picked.length === 0 || vote.isPending}>
              {vote.isPending ? "Saving…" : "Vote"}
            </Button>
            {changing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPicked(poll.viewer.votes);
                  setChanging(false);
                }}
              >
                Keep my answer
              </Button>
            ) : null}
            {changing && poll.viewer.votes.length > 0 ? (
              <Button type="button" variant="ghost" disabled={vote.isPending} onClick={() => vote.mutate({ pollId: poll.id, optionIds: [] })}>
                Take back my vote
              </Button>
            ) : null}
          </div>
        </form>
      ) : poll.viewer.showResults ? (
        <ul className="mt-3 space-y-2">
          {poll.options.map((o) => {
            const share = total > 0 ? Math.round(((o.voteCount ?? 0) / total) * 100) : 0;
            const mine = poll.viewer.votes.includes(o.id);
            return (
              <li key={o.id} className="relative overflow-hidden rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <div
                  aria-hidden
                  className={cx("absolute inset-y-0 left-0", mine ? "bg-accent/25" : "bg-surface-2")}
                  style={{ width: `${share}%` }}
                />
                <div className="relative flex items-center justify-between gap-3">
                  <span className={cx(mine && "font-medium")}>
                    {o.label}
                    {mine ? <span className="ml-1.5 text-xs text-accent">your vote</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {share}% <span className="sr-only">({votes(o.voteCount ?? 0)})</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          {poll.voterCount} {poll.voterCount === 1 ? "person" : "people"} answered
        </span>
        <span suppressHydrationWarning>
          {poll.closed ? "Closed" : poll.closesAt ? `Closes ${timeAgo(poll.closesAt)}` : "Open"}
        </span>
        {poll.viewer.canVote && !voting ? (
          <button type="button" className="text-accent hover:underline" onClick={() => setChanging(true)}>
            Change my vote
          </button>
        ) : null}
        {!poll.viewer.canVote && !poll.closed && poll.eventId ? <span>For people going or maybe</span> : null}
      </p>
      {vote.error ? <p className="mt-2 text-sm text-danger">{errorMessage(vote.error)}</p> : null}
    </article>
  );
}

/** Close early or delete, for whoever asked and moderators. */
function PollMenu({ poll }: { poll: PollView }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const close = useMutation(trpc.poll.close.mutationOptions({ onSuccess: () => router.refresh() }));
  const remove = useMutation(
    trpc.poll.delete.mutationOptions({
      onSuccess: () => {
        setConfirming(false);
        router.refresh();
      },
    }),
  );

  return (
    <span className="ml-auto flex gap-1">
      {!poll.closed ? (
        <Button variant="ghost" className="px-2 py-1 text-xs" disabled={close.isPending} onClick={() => close.mutate({ pollId: poll.id })}>
          Close poll
        </Button>
      ) : null}
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirming(true)}>
        Delete
      </Button>
      {confirming ? (
        <Dialog title="Delete this poll?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-muted">
            “{poll.question}” and its {answers(poll.voterCount)} will be gone for everyone. To stop voting but keep the result, close it
            instead.
          </p>
          {remove.error ? <p className="mt-3 text-sm text-danger">{errorMessage(remove.error)}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button className="bg-danger text-white" disabled={remove.isPending} onClick={() => remove.mutate({ pollId: poll.id })}>
              {remove.isPending ? "Deleting…" : "Delete poll"}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </span>
  );
}
