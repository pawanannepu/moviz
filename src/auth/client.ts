import { createAuthClient } from "better-auth/client";

/**
 * The browser client for Better Auth. It calls the same origin `/api/auth/*`
 * routes, so the library's rate limits and bot check run on every request
 * (spec 0005). Import it from client components only.
 */
export const authClient = createAuthClient();
