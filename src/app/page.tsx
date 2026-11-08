import { Hero } from "@/ui/landing/hero";
import type { HeroPick } from "@/ui/landing/hero-picks";
import { loadHeroPick } from "@/ui/landing/load-hero-pick";

// The hero poster comes from the catalog. Refresh it hourly, not on every visit.
export const revalidate = 3600;

/**
 * Reads the hero pick. The database module is imported here, not at the top, so
 * a build with no `DATABASE_URL` (as in CI) still renders the empty poster
 * frame instead of failing. The page refreshes within the hour.
 */
async function getHeroPick(): Promise<HeroPick | null> {
  try {
    const { db } = await import("@/db/client");
    return await loadHeroPick(db);
  } catch {
    return null;
  }
}

export default async function Home() {
  return <Hero pick={await getHeroPick()} />;
}
