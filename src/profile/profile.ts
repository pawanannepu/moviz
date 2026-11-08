import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/create-db";
import {
  type DbUnavailable,
  toDbFailure,
  type UserNotFound,
} from "@/db/failure";
import { profiles } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";

export type Profile = typeof profiles.$inferSelect;
export type CountrySource = NonNullable<Profile["countrySource"]>;

export type ProfileError =
  | UserNotFound
  | DbUnavailable
  | { code: "invalid_country" };

/**
 * A country always comes with the source that set it, so the type refuses one
 * without the other. `ip` is the `x-vercel-ip-country` header; `user` is the
 * person's own choice.
 */
export type UpsertProfileInput = {
  userId: string;
  /** Stamps `terms_accepted_at` with now and records which terms version. */
  termsVersion?: string;
} & (
  | { country: string; countrySource: CountrySource }
  | { country?: undefined; countrySource?: undefined }
);

/**
 * Reads the user's profile, creating an empty one if it is missing (the sign up
 * hook normally creates it; this is the lazy backstop).
 */
export async function getProfile(
  db: Db,
  input: { userId: string },
): Promise<Result<Profile, UserNotFound | DbUnavailable>> {
  try {
    const [existing] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, input.userId));
    if (existing) return ok(existing);

    await db
      .insert(profiles)
      .values({ userId: input.userId })
      .onConflictDoNothing();
    const [created] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, input.userId));
    return ok(created);
  } catch (error) {
    const failure = toDbFailure(error);
    if (
      failure?.code === "user_not_found" ||
      failure?.code === "db_unavailable"
    ) {
      return err(failure);
    }
    throw error;
  }
}

/**
 * Creates or updates the profile. A country from the IP header only writes when
 * the profile has no country yet or its country came from the IP too, so a
 * country the user chose is never overwritten by it. A user chosen country always
 * writes. Fields not passed are left alone.
 */
export async function upsertProfile(
  db: Db,
  input: UpsertProfileInput,
): Promise<Result<Profile, ProfileError>> {
  const { userId, termsVersion, country, countrySource } = input;

  let normalizedCountry: string | null = null;
  if (country !== undefined || countrySource !== undefined) {
    const upper = (country ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(upper) || countrySource === undefined) {
      return err({ code: "invalid_country" });
    }
    normalizedCountry = upper;
  }

  // What to write when the row already exists. Built only from what was passed.
  const set: Record<string, unknown> = {};
  if (normalizedCountry !== null && countrySource !== undefined) {
    if (countrySource === "user") {
      set.country = normalizedCountry;
      set.countrySource = "user";
    } else {
      const mayWrite = sql`${profiles.country} is null or ${profiles.countrySource} = 'ip'`;
      set.country = sql`case when ${mayWrite} then ${normalizedCountry}::char(2) else ${profiles.country} end`;
      set.countrySource = sql`case when ${mayWrite} then 'ip'::country_source else ${profiles.countrySource} end`;
    }
  }
  if (termsVersion !== undefined) {
    set.termsAcceptedAt = sql`now()`;
    set.termsVersion = termsVersion;
  }
  if (Object.keys(set).length > 0) set.updatedAt = sql`now()`;

  try {
    const insert = db.insert(profiles).values({
      userId,
      country: normalizedCountry,
      countrySource: normalizedCountry === null ? null : countrySource,
      termsAcceptedAt: termsVersion === undefined ? null : sql`now()`,
      termsVersion: termsVersion ?? null,
    });
    if (Object.keys(set).length === 0) {
      await insert.onConflictDoNothing();
    } else {
      await insert.onConflictDoUpdate({ target: profiles.userId, set });
    }
    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return ok(row);
  } catch (error) {
    const failure = toDbFailure(error);
    if (
      failure?.code === "user_not_found" ||
      failure?.code === "db_unavailable"
    ) {
      return err(failure);
    }
    throw error;
  }
}
