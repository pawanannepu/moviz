/**
 * The `/design` review page is hidden only in production. Vercel sets
 * `VERCEL_ENV` to `production`, `preview` or `development`; local runs leave it
 * unset, so the page shows there and on preview deployments (spec 0004, AC-17).
 */
export function isDesignPageHidden(vercelEnv: string | undefined): boolean {
  return vercelEnv === "production";
}
