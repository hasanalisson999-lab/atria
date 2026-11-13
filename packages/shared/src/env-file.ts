import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// Node-only (worker, scripts, tests). Kept out of env.ts so the web bundle never traces the filesystem.
/**
 * Loads the monorepo-root .env into process.env (without overriding variables that are already
 * set, so hosted platforms win). Safe to call many times; a missing file is not an error.
 */
export function loadRootEnv(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate) && existsSync(join(dir, "turbo.json"))) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
