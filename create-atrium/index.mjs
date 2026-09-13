#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  directoryIsUsable,
  materializeProject,
  setupProject,
} from "./bootstrap.mjs";
import { HELP_TEXT, parseArgs } from "./parse-args.mjs";

async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`create-atrium: ${message}`);
    process.exit(1);
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }

  const nodeMajor = Number(process.versions.node.split(".")[0] ?? "0");
  if (nodeMajor < 20) {
    console.error("create-atrium requires Node.js 20 or newer.");
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), options.directory);

  if (!options.dryRun) {
    const usable = await directoryIsUsable(targetDir);
    if (!usable) {
      console.error(
        `create-atrium: target directory is not empty: ${targetDir}\nChoose a new directory or remove the existing files.`,
      );
      process.exit(1);
    }
  }

  console.log(`Creating Atrium in ${targetDir} (branch: ${options.branch})…`);

  const bootstrapDir = path.dirname(fileURLToPath(import.meta.url));

  await materializeProject(options.branch, targetDir, {
    dryRun: options.dryRun,
    bootstrapDir,
  });
  await setupProject(targetDir, {
    dryRun: options.dryRun,
    skipDev: options.skipDev,
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`create-atrium: ${message}`);
  process.exit(1);
});
