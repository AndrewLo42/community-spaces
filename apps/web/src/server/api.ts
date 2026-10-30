import { createCaller } from "@cs/api";
import { cache } from "react";
import { getSessionUser } from "./auth";
import { db } from "./db";
import { mailerContext } from "./mailer";
import { storage } from "./storage";

/** tRPC caller for Server Components: same procedures, no HTTP hop. */
export const serverApi = cache(async () => createCaller({ db, storage, user: await getSessionUser(), ...mailerContext }));
