import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { CreateGroupForm } from "./create-group-form";

export const metadata: Metadata = { title: "Start a group" };

export default async function NewGroupPage() {
  if (!(await getSessionUser())) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Start a group</h1>
      <p className="mt-1 text-sm text-muted">You'll be the owner. You can change any of this later.</p>
      <div className="mt-8">
        <CreateGroupForm />
      </div>
    </div>
  );
}
