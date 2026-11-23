import type { Context } from "@cs/api";
import { after } from "next/server";
import { sendAnnouncementEmails } from "./announcement-email";
import { sendEventChangeEmails } from "./event-change-email";

/** The email side of the API context: what it sends, and running it after the response. */
export const mailerContext: Pick<Context, "mailer" | "after"> = {
  mailer: { sendAnnouncement: sendAnnouncementEmails, sendEventChange: sendEventChangeEmails },
  after: (task) => after(task),
};
