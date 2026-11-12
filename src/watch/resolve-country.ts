import type { Db } from "@/db/create-db";
import type { DbUnavailable } from "@/db/failure";
import { err, ok, type Result } from "@/lib/result";
import { getProfile, upsertProfile } from "@/profile/profile";
import { toWatchRegion, type WatchRegion } from "./regions";

/**
 * The user's country for where to watch (spec 0013, AC-5), in order: the
 * profile's country when it is a watch region; else the `x-vercel-ip-country`
 * header when it is one; else null. The header is saved with source `ip` only
 * when the profile has no country yet, so a page view never rewrites a stored
 * country (and never a user's choice, spec 0002). Nothing here is logged.
 */
export async function resolveCountry(
  db: Db,
  input: { userId: string; ipCountry: string | null },
): Promise<Result<WatchRegion | null, DbUnavailable>> {
  try {
    const profile = await getProfile(db, { userId: input.userId });
    if (!profile.ok) return err({ code: "db_unavailable" });

    const stored = toWatchRegion(profile.value.country);
    if (stored !== null) return ok(stored);

    const fromIp = toWatchRegion(input.ipCountry);
    if (fromIp === null) return ok(null);

    if (profile.value.country === null) {
      // A failed save still shows this view the IP country; the next view retries.
      await upsertProfile(db, {
        userId: input.userId,
        country: fromIp,
        countrySource: "ip",
      }).catch(() => undefined);
    }
    return ok(fromIp);
  } catch {
    return err({ code: "db_unavailable" });
  }
}
