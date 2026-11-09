import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth/auth";

// Database code runs on Node.js (spec 0001).
export const runtime = "nodejs";

/**
 * Better Auth's own routes: sign up, sign in, sign out, verify, reset. This is
 * a documented exception to "every Route Handler validates with Zod", because
 * the library owns its input checks (spec 0005).
 */
export const { GET, POST } = toNextJsHandler(auth);
