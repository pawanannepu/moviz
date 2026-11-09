import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "@/auth/terms";
import { profiles } from "@/db/schema";
import {
  forbiddenDb,
  TEST_DATABASE_URL,
  UNKNOWN_USER_ID,
  useTestDb,
} from "@/test-support/test-db";
import { getProfile, upsertProfile } from "./profile";

describe("upsertProfile country checks", () => {
  it.each(["USA", "U", "1", "12", "", "   ", "U!", "é"])(
    "returns invalid_country for %j without touching the database (AC-17)",
    async (country) => {
      const result = await upsertProfile(forbiddenDb, {
        userId: "u",
        country,
        countrySource: "user",
      });
      expect(result).toEqual({ ok: false, error: { code: "invalid_country" } });
    },
  );
});

describe.skipIf(!TEST_DATABASE_URL)("profile (database)", () => {
  const t = useTestDb();

  const profileOf = async (userId: string) => {
    const [row] = await t.db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return row;
  };

  describe("getProfile", () => {
    it("creates a profile with the terms fields when none exists (AC-17, spec 0005 AC-12)", async () => {
      const user = await t.fx.newUser();
      expect(await profileOf(user.id)).toBeUndefined();

      const result = await getProfile(t.db, { userId: user.id });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toMatchObject({
          userId: user.id,
          country: null,
          countrySource: null,
          onboardedAt: null,
          termsVersion: TERMS_VERSION,
        });
        expect(result.value.termsAcceptedAt).toBeInstanceOf(Date);
      }
      expect(await profileOf(user.id)).toBeDefined();
    });

    it("returns the same row on a second read instead of making another", async () => {
      const user = await t.fx.newUser();
      const first = await getProfile(t.db, { userId: user.id });
      const second = await getProfile(t.db, { userId: user.id });
      if (!first.ok || !second.ok) throw new Error("getProfile failed");
      expect(second.value.createdAt.getTime()).toBe(
        first.value.createdAt.getTime(),
      );
    });

    it("survives two first reads at the same moment", async () => {
      const user = await t.fx.newUser();
      const results = await Promise.all([
        getProfile(t.db, { userId: user.id }),
        getProfile(t.db, { userId: user.id }),
        getProfile(t.db, { userId: user.id }),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
    });

    it("returns user_not_found for an unknown user", async () => {
      const result = await getProfile(t.db, { userId: UNKNOWN_USER_ID });
      expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
    });
  });

  describe("upsertProfile country rules (AC-17)", () => {
    it("upper cases and trims a country from the IP header", async () => {
      const user = await t.fx.newUser();
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: " in ",
        countrySource: "ip",
      });
      expect(result.ok && result.value).toMatchObject({
        country: "IN",
        countrySource: "ip",
      });
    });

    it("lets the IP header fill a country that is not set yet", async () => {
      const user = await t.fx.newUser();
      await getProfile(t.db, { userId: user.id });
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: "FR",
        countrySource: "ip",
      });
      expect(result.ok && result.value).toMatchObject({
        country: "FR",
        countrySource: "ip",
      });
    });

    it("lets a later IP country replace an earlier IP country", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "IN",
        countrySource: "ip",
      });
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: "DE",
        countrySource: "ip",
      });
      expect(result.ok && result.value).toMatchObject({
        country: "DE",
        countrySource: "ip",
      });
    });

    it("lets a chosen country replace an IP country", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "IN",
        countrySource: "ip",
      });
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: "gb",
        countrySource: "user",
      });
      expect(result.ok && result.value).toMatchObject({
        country: "GB",
        countrySource: "user",
      });
    });

    it("never lets the IP header overwrite a country the user chose", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "GB",
        countrySource: "user",
      });
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: "FR",
        countrySource: "ip",
      });
      expect(result.ok && result.value).toMatchObject({
        country: "GB",
        countrySource: "user",
      });
      expect(await profileOf(user.id)).toMatchObject({
        country: "GB",
        countrySource: "user",
      });
    });

    it("lets a user change their own chosen country", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "GB",
        countrySource: "user",
      });
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: "JP",
        countrySource: "user",
      });
      expect(result.ok && result.value).toMatchObject({
        country: "JP",
        countrySource: "user",
      });
    });

    it("keeps the stored country when an invalid one is sent", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "GB",
        countrySource: "user",
      });
      const result = await upsertProfile(t.db, {
        userId: user.id,
        country: "USA",
        countrySource: "user",
      });
      expect(result.ok).toBe(false);
      expect(await profileOf(user.id)).toMatchObject({ country: "GB" });
    });
  });

  describe("upsertProfile terms (AC-17)", () => {
    it("stamps the accepted time and the terms version", async () => {
      const user = await t.fx.newUser();
      const before = Date.now() - 5000;
      const result = await upsertProfile(t.db, {
        userId: user.id,
        termsVersion: "2026-11",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.termsVersion).toBe("2026-11");
        expect(result.value.termsAcceptedAt?.getTime()).toBeGreaterThan(before);
        expect(result.value.country).toBeNull();
      }
    });

    it("keeps the terms when a country is written later", async () => {
      const user = await t.fx.newUser();
      const first = await upsertProfile(t.db, {
        userId: user.id,
        termsVersion: "2026-11",
      });
      await upsertProfile(t.db, {
        userId: user.id,
        country: "IN",
        countrySource: "ip",
      });
      const row = await profileOf(user.id);
      expect(row.termsVersion).toBe("2026-11");
      expect(row.termsAcceptedAt?.getTime()).toBe(
        first.ok ? first.value.termsAcceptedAt?.getTime() : -1,
      );
    });

    it("keeps the country when terms are accepted later", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "GB",
        countrySource: "user",
      });
      await upsertProfile(t.db, { userId: user.id, termsVersion: "2026-11" });
      expect(await profileOf(user.id)).toMatchObject({
        country: "GB",
        countrySource: "user",
        termsVersion: "2026-11",
      });
    });
  });

  describe("upsertProfile with nothing to write", () => {
    it("creates an empty profile", async () => {
      const user = await t.fx.newUser();
      const result = await upsertProfile(t.db, { userId: user.id });
      expect(result.ok && result.value.country).toBeNull();
    });

    it("does not change a profile that already has data", async () => {
      const user = await t.fx.newUser();
      await upsertProfile(t.db, {
        userId: user.id,
        country: "GB",
        countrySource: "user",
        termsVersion: "v1",
      });
      const result = await upsertProfile(t.db, { userId: user.id });
      expect(result.ok && result.value).toMatchObject({
        country: "GB",
        countrySource: "user",
        termsVersion: "v1",
      });
    });
  });

  it("returns user_not_found when the user does not exist", async () => {
    const result = await upsertProfile(t.db, {
      userId: UNKNOWN_USER_ID,
      country: "GB",
      countrySource: "user",
    });
    expect(result).toEqual({ ok: false, error: { code: "user_not_found" } });
  });
});
