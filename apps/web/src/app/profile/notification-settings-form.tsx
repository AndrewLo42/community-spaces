"use client";

import { NOTIFICATION_SETTING_KEYS, NOTIFICATION_SETTINGS, type NotificationSetting } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

/** Which optional kinds of in-app notification to get. The important ones can't be turned off. */
export function NotificationSettingsForm({ muted }: { muted: string[] }) {
  const trpc = useTRPC();
  const save = useMutation(trpc.notification.setNotificationSetting.mutationOptions());
  const [off, setOff] = useState(() => new Set(muted));

  function toggle(setting: NotificationSetting, enabled: boolean) {
    setOff((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(setting);
      else next.add(setting);
      return next;
    });
    save.mutate({ setting, enabled });
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Notifications in the app</legend>
      <p className="text-xs text-muted">
        Event changes and cancellations, reminders, announcements and anything about your membership always come through.
      </p>
      <div className="space-y-2">
        {NOTIFICATION_SETTING_KEYS.map((key) => (
          <label key={key} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
            <input type="checkbox" className="mt-0.5" checked={!off.has(key)} onChange={(e) => toggle(key, e.target.checked)} />
            <span>
              <span className="block font-medium">{NOTIFICATION_SETTINGS[key].label}</span>
              <span className="mt-0.5 block text-xs text-muted">{NOTIFICATION_SETTINGS[key].description}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="h-4 text-xs text-muted" aria-live="polite">
        {save.isPending ? "Saving…" : save.isSuccess ? "Saved" : null}
        {save.error ? <span className="text-danger">{errorMessage(save.error)}</span> : null}
      </p>
    </fieldset>
  );
}
