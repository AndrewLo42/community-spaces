"use client";

import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason, type ReportTarget } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Dialog } from "./dialog";
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

  if (report.isSuccess) {
    return (
      <Dialog title="Thanks for letting us know" onClose={onClose}>
        <p className="text-sm text-muted">This group's moderators will take a look. The author won't see who reported it.</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Report this ${targetType}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) report.mutate({ targetType, targetId, reason, details });
        }}
      >
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
    </Dialog>
  );
}
