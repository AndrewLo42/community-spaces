"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ devHint }: { devHint: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          We sent a sign-in link to <span className="text-fg">{email}</span>.
          {devHint ? " (Dev mode: the link is printed in the server terminal.)" : ""}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        setError(null);
        const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
        if (error) {
          setError(error.message ?? "Couldn't send the link");
          setState("idle");
        } else {
          setState("sent");
        }
      }}
    >
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
      <Button type="submit" className="w-full" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
