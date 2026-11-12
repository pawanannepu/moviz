import { redirect } from "next/navigation";
import { HOME_PATH } from "@/auth/paths";
import { getSession } from "@/auth/session";
import { Hero } from "@/ui/landing/hero";
import type { HeroPick } from "@/ui/landing/hero-picks";
import { loadHeroPick } from "@/ui/landing/load-hero-pick";

/**
 * Reads the hero pick. The database module is imported here, not at the top, so
 * a build with no `DATABASE_URL` (as in CI) still renders the empty poster
 * frame instead of failing.
 */
async function getHeroPick(): Promise<HeroPick | null> {
  try {
    const { db } = await import("@/db/client");
    return await loadHeroPick(db);
  } catch {
    return null;
  }
}

/**
 * The landing page. It reads the session, so it is rendered per request, and a
 * signed in visitor goes to the home page (spec 0005, AC-9). A cookie with no
 * live session counts as signed out. After an account is deleted it shows one
 * status line (spec 0014, AC-10); only the fixed `deleted=1` value does.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  if (await getSession()) redirect(HOME_PATH);
  const { deleted } = await searchParams;
  return (
    <>
      <div role="status" className="page-container empty:hidden">
        {deleted === "1" ? (
          <p className="mt-4 rounded-control border border-border bg-card p-4">
            Your account and all its data are deleted.
          </p>
        ) : null}
      </div>
      <Hero pick={await getHeroPick()} />
    </>
  );
}
