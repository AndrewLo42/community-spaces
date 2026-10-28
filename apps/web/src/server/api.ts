import { createCaller } from "@cs/api";
import { cache } from "react";
import { getSessionUser } from "./auth";
import { db } from "./db";

/** tRPC caller for Server Components: same procedures, no HTTP hop. */
export const serverApi = cache(async () => createCaller({ db, user: await getSessionUser() }));
