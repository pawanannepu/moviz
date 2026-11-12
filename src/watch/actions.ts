"use server";

import { z } from "zod";
import { getUserForAction } from "@/auth/session";
import { db } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { upsertProfile } from "@/profile/profile";
import { WATCH_REGIONS, type WatchRegion } from "./regions";

/*
 * The one Server Action of where to watch (spec 0013, AC-10). It reads the user
 * from the live session, validates the country with Zod and saves it with
 * source `user`. It logs nothing: a country is personal data.
 */

const inputSchema = z.object({
  country: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.enum(WATCH_REGIONS)),
});

export type SetCountryResult = Result<
  { country: WatchRegion },
  { code: "unauthenticated" | "invalid_input" | "db_unavailable" }
>;

/**
 * Saves the signed in user's country for where to watch, as their own choice
 * (source `user`), which an IP country never replaces. The user id comes from
 * the session only.
 */
export async function setCountryAction(
  input: unknown,
): Promise<SetCountryResult> {
  const session = await getUserForAction();
  if (!session.ok) return err({ code: "unauthenticated" });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return err({ code: "invalid_input" });
  const { country } = parsed.data;

  const saved = await upsertProfile(db, {
    userId: session.user.id,
    country,
    countrySource: "user",
  });
  if (!saved.ok) {
    switch (saved.error.code) {
      case "invalid_country":
        return err({ code: "invalid_input" });
      case "user_not_found":
        return err({ code: "unauthenticated" });
      case "db_unavailable":
        return err({ code: "db_unavailable" });
    }
  }
  return ok({ country });
}
