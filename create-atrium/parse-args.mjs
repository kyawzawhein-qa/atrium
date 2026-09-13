/** @typedef {{ directory: string; branch: string; skipDev: boolean; dryRun: boolean; help: boolean }} CreateAtriumOptions */

const DEFAULT_DIRECTORY = "atrium";
const DEFAULT_BRANCH = "main";

/**
 * @param {string[]} argv
 * @returns {CreateAtriumOptions}
 */
export function parseArgs(argv) {
  let directory = DEFAULT_DIRECTORY;
  let branch = DEFAULT_BRANCH;
  let skipDev = false;
  let dryRun = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--skip-dev") {
      skipDev = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--branch") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --branch");
      }
      branch = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    directory = arg;
  }

  return { directory, branch, skipDev, dryRun, help };
}

export const HELP_TEXT = `create-atrium — bootstrap a local Atrium studio

Usage:
  create-atrium [directory] [options]

Options:
  --branch <name>   Git branch to download (default: ${DEFAULT_BRANCH})
  --skip-dev        Install and set up the database, but do not start the dev server
  --dry-run         Print the planned steps without downloading or installing
  -h, --help        Show this help

Examples:
  create-atrium
  create-atrium my-studio
  create-atrium . --skip-dev
`;
