import type { NextConfig } from "next";
import { assertLegalDetailsForBuild } from "./src/legal/operator";

// A production deploy on Vercel refuses to build while the privacy policy and
// terms still hold placeholder details (spec 0014, AC-12). This reads
// `process.env` directly, outside `src/env.ts`, because the config runs before
// the app does.
assertLegalDetailsForBuild({
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The reset link puts a one time token in the address. Send no
        // referrer, so it can never leak to another site (spec 0005, AC-6).
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
