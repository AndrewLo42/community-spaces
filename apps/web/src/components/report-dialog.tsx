"use client";

import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason, type ReportTarget } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Button, cx, Textarea } from "./ui";

export function ReportDialog({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ReportTarget;
  targetId: string;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const report = useMutation(trpc.report.create.mutationOptions());
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {report.isSuccess ? (
          <div className="space-y-4">
            <h2 id="report-title" className="font-serif text-xl font-semibold">
              Thanks for letting us know
            </h2>
            <p className="text-sm text-muted">This group's moderators will take a look. The author won't see who reported it.</p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason) report.mutate({ targetType, targetId, reason, details });
            }}
          >
            <h2 id="report-title" className="font-serif text-xl font-semibold">
              Report this {targetType}
            </h2>
            <fieldset className="space-y-2">
              <legend className="sr-only">Reason</legend>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    reason === r ? "border-accent ring-1 ring-accent" : "border-line",
                  )}
                >
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                  {REPORT_REASON_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything moderators should know? (optional)"
              maxLength={1000}
              aria-label="Details"
            />
            {report.error ? <p className="text-sm text-danger">{errorMessage(report.error)}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!reason || report.isPending}>
                {report.isPending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
