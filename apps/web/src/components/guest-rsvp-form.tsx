"use client";

import { useState } from "react";
import { guestRsvpCallback } from "@/app/e/[id]/actions";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input, cx } from "./ui";

/**
 * RSVP for someone who isn't signed in: name, email, Going or Maybe. We email
 * a link; clicking it signs them in (making an account if they're new) and
 * saves the answer. Nothing counts until then.
 */
export function GuestRsvpForm({
  eventId,
  share,
  full,
  devHint,
}: {
  eventId: string;
  /** The share code from the link they came in on, for private groups. */
  share: string | null;
  full: boolean;
  devHint: boolean;
}) {
  const [status, setStatus] = useState<"going" | "maybe">(full ? "maybe" : "going");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <div role="status" className="rounded-lg border border-line bg-bg p-4 text-sm">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-muted">
          We sent a link to <span className="text-fg">{email}</span>. Click it to confirm you're {status === "going" ? "going" : "a maybe"}.
          {devHint ? " (Dev mode: the link is printed in the server terminal.)" : ""}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        setError(null);
        const link = await guestRsvpCallback({ eventId, share: share ?? "", email, status });
        if ("error" in link) {
          setError(link.error);
          setState("idle");
          return;
        }
        const { error } = await authClient.signIn.magicLink({ email, name: name.trim() || undefined, callbackURL: link.callbackURL });
        if (error) {
          setError(error.status === 429 ? "Too many tries. Wait a few minutes and try again." : (error.message ?? "Couldn't send the link"));
          setState("idle");
        } else {
          setState("sent");
        }
      }}
    >
      <div role="radiogroup" aria-label="Your answer" className="grid grid-cols-2 gap-2">
        {(["going", "maybe"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            disabled={s === "going" && full}
            onClick={() => setStatus(s)}
            className={cx(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
              status === s ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface hover:border-accent",
            )}
          >
            {s === "going" ? "Going" : "Maybe"}
          </button>
        ))}
      </div>
      {full ? <p className="text-xs text-muted">Going is full, but you can still say maybe.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name">
          <Input required maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" error={error ?? undefined}>
          <Input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
      </div>
      <Button type="submit" className="w-full sm:w-auto" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a link to confirm"}
      </Button>
      <p className="text-xs text-muted">
        No password. The link confirms your RSVP and signs you in, so you'll get the reminder and any updates. Already have an account? Use the
        same email.
      </p>
    </form>
  );
}
