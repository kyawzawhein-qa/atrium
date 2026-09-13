import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";

const REPO = "kyawzawhein-qa/atrium";

const SKIP_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  "create-atrium",
  ".env",
]);

/**
 * @param {string} name
 */
export function shouldSkipPath(name) {
  if (SKIP_NAMES.has(name)) {
    return true;
  }

  return name.endsWith(".db");
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string; dryRun?: boolean }} [options]
 */
export function run(command, args, options = {}) {
  if (options.dryRun) {
    const cwd = options.cwd ? ` (cwd: ${options.cwd})` : "";
    console.log(`[dry-run] ${command} ${args.join(" ")}${cwd}`);
    return;
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * @param {string} dir
 */
export async function directoryIsUsable(dir) {
  try {
    await access(dir);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }

  const entries = await readdir(dir);
  return entries.length === 0;
}

/**
 * @param {string} bootstrapDir
 */
export async function resolveLocalSourceDir(bootstrapDir) {
  const repoRoot = path.resolve(bootstrapDir, "..");
  const packageJsonPath = path.join(repoRoot, "package.json");

  try {
    const raw = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.name !== "atrium") {
      return null;
    }

    await access(path.join(repoRoot, "prisma", "schema.prisma"));
    return repoRoot;
  } catch {
    return null;
  }
}

/**
 * @param {string} branch
 */
export function tarballUrl(branch) {
  return `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${branch}`;
}

/**
 * @param {string} branch
 * @param {string} targetDir
 * @param {{ dryRun?: boolean; bootstrapDir?: string }} [options]
 */
export async function materializeProject(branch, targetDir, options = {}) {
  const localSource = options.bootstrapDir
    ? await resolveLocalSourceDir(options.bootstrapDir)
    : null;

  if (options.dryRun) {
    if (localSource) {
      console.log(`[dry-run] copy ${localSource} -> ${targetDir}`);
    } else {
      console.log(`[dry-run] download ${tarballUrl(branch)} -> ${targetDir}`);
    }
    return;
  }

  await mkdir(targetDir, { recursive: true });

  if (localSource) {
    await copyTree(localSource, targetDir);
    return;
  }

  const tempRoot = await fsMkdtemp(path.join(tmpdir(), "create-atrium-"));
  const archivePath = path.join(tempRoot, "atrium.tar.gz");
  const extractDir = path.join(tempRoot, "extracted");

  try {
    const response = await fetch(tarballUrl(branch));
    if (!response.ok) {
      throw new Error(
        `Failed to download Atrium (${response.status} ${response.statusText}). Check the branch name or your network connection.`,
      );
    }

    if (!response.body) {
      throw new Error("Failed to download Atrium: empty response body.");
    }

    await mkdir(extractDir, { recursive: true });
    await pipeline(response.body, createWriteStream(archivePath));

    run("tar", ["-xzf", archivePath, "-C", extractDir, "--strip-components=1"]);
    await copyTree(extractDir, targetDir);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/**
 * @param {string} sourceDir
 * @param {string} targetDir
 */
async function copyTree(sourceDir, targetDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipPath(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await mkdir(targetPath, { recursive: true });
      await copyTree(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile() || entry.isSymbolicLink()) {
      await copyFile(sourcePath, targetPath);
    }
  }
}

/**
 * @param {string} prefix
 */
async function fsMkdtemp(prefix) {
  const random = Math.random().toString(16).slice(2);
  const dir = `${prefix}${random}`;
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * @param {string} projectDir
 * @param {{ dryRun?: boolean; skipDev?: boolean }} options
 */
export async function setupProject(projectDir, options = {}) {
  const envExample = path.join(projectDir, ".env.example");
  const envFile = path.join(projectDir, ".env");

  run("npm", ["install"], { cwd: projectDir, dryRun: options.dryRun });

  if (options.dryRun) {
    console.log(`[dry-run] copy ${envExample} -> ${envFile} (if missing)`);
  } else {
    try {
      await access(envFile);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        await copyFile(envExample, envFile);
      } else {
        throw error;
      }
    }
  }

  run("npm", ["run", "db:setup"], { cwd: projectDir, dryRun: options.dryRun });

  if (!options.skipDev) {
    console.log("\nStarting Atrium on http://localhost:3000 (localhost only)…\n");
    run("npm", ["run", "dev"], { cwd: projectDir, dryRun: options.dryRun });
  } else {
    console.log("\nAtrium is ready. Start the studio with:\n");
    console.log(`  cd ${projectDir}`);
    console.log("  npm run dev\n");
  }
}
