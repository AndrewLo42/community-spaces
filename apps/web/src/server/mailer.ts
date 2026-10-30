import type { Context } from "@cs/api";
import { after } from "next/server";
import { sendAnnouncementEmails } from "./announcement-email";

/** The email side of the API context: what it sends, and running it after the response. */
export const mailerContext: Pick<Context, "mailer" | "after"> = {
  mailer: { sendAnnouncement: sendAnnouncementEmails },
  after: (task) => after(task),
};
