import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Secrets live in the monorepo-root .env (one file for web + worker). Variables already set by the
// host (Vercel) take precedence because loadEnvFile never overrides existing values.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@signal/shared"],
  devIndicators: { position: "bottom-right" },
  serverExternalPackages: ["postgres", "sharp"],
  turbopack: {
    root: resolve(process.cwd(), "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
