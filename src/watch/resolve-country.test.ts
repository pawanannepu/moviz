import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/create-db";
import { profiles } from "@/db/schema";
import { upsertProfile } from "@/profile/profile";
import { TEST_DATABASE_URL, useTestDb } from "@/test-support/test-db";
import { resolveCountry } from "./resolve-country";

// Spec 0013, AC-5 (and spec 0002, AC-17): which country the section uses, and
// when the IP header is saved to the profile.

/** A database that fails every query, as if Postgres were down. */
const brokenDb = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error("connection refused");
      };
    },
  },
) as unknown as Db;

describe("resolveCountry without a database", () => {
  it("returns db_unavailable instead of throwing", async () => {
    const result = await resolveCountry(brokenDb, {
      userId: "u",
      ipCountry: "US",
    });

    expect(result).toEqual({ ok: false, error: { code: "db_unavailable" } });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("resolveCountry (database)", () => {
  const t = useTestDb();

  const profileOf = async (userId: string) => {
    const [row] = await t.db
      .select({ country: profiles.country, source: profiles.countrySource })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return row;
  };

  it("takes the IP header for a new profile and saves it with source ip", async () => {
    const user = await t.fx.newUser();

    const result = await resolveCountry(t.db, {
      userId: user.id,
      ipCountry: "fr",
    });

    expect(result).toEqual({ ok: true, value: "FR" });
    expect(await profileOf(user.id)).toEqual({ country: "FR", source: "ip" });
  });

  it("keeps a user chosen country when the header says another one", async () => {
    const user = await t.fx.newUser();
    await upsertProfile(t.db, {
      userId: user.id,
      country: "FR",
      countrySource: "user",
    });

    const result = await resolveCountry(t.db, {
      userId: user.id,
      ipCountry: "US",
    });

    expect(result).toEqual({ ok: true, value: "FR" });
    expect(await profileOf(user.id)).toEqual({ country: "FR", source: "user" });
  });

  it("never rewrites a stored IP country from a page view", async () => {
    const user = await t.fx.newUser();
    await resolveCountry(t.db, { userId: user.id, ipCountry: "US" });

    const result = await resolveCountry(t.db, {
      userId: user.id,
      ipCountry: "DE",
    });

    expect(result).toEqual({ ok: true, value: "US" });
    expect(await profileOf(user.id)).toEqual({ country: "US", source: "ip" });
  });

  it.each(["XX", "T1", "", null])(
    "returns no country for header %j and saves nothing",
    async (ipCountry) => {
      const user = await t.fx.newUser();

      const result = await resolveCountry(t.db, { userId: user.id, ipCountry });

      expect(result).toEqual({ ok: true, value: null });
      expect(await profileOf(user.id)).toEqual({ country: null, source: null });
    },
  );

  it("uses the header, without saving it, when the stored country is not a watch region", async () => {
    const user = await t.fx.newUser();
    await upsertProfile(t.db, {
      userId: user.id,
      country: "AQ",
      countrySource: "user",
    });

    const result = await resolveCountry(t.db, {
      userId: user.id,
      ipCountry: "US",
    });

    expect(result).toEqual({ ok: true, value: "US" });
    expect(await profileOf(user.id)).toEqual({ country: "AQ", source: "user" });
  });
});
