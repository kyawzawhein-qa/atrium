import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export type TestDb = {
  dir: string;
  url: string;
  cleanup: () => void;
};

function resetPrismaSingleton(): void {
  const globalForPrisma = globalThis as { prisma?: PrismaClient };
  void globalForPrisma.prisma?.$disconnect();
  delete globalForPrisma.prisma;
}

/** Ephemeral SQLite database with current Prisma schema (for unit tests). */
export function createTestDb(): TestDb {
  resetPrismaSingleton();
  const dir = mkdtempSync(path.join(os.tmpdir(), "atrium-test-"));
  const dbPath = path.join(dir, `test-${randomUUID()}.db`);
  const url = `file:${dbPath}`;
  process.env.DATABASE_URL = url;
  execSync("npx prisma db push --skip-generate", {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  return {
    dir,
    url,
    cleanup: () => {
      resetPrismaSingleton();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "EBUSY" && code !== "EPERM") throw err;
      }
    },
  };
}
