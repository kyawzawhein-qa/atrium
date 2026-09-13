import { mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { getOrCreateSettings, getStudioSettings } from "./settings";

export const DEMO_AGENT_SLUG = "launch-demo";
export const DEMO_WORKSPACE_DIR = "demo-workspace";

export function demoWorkspacePath(cwd = process.cwd()): string {
  return path.join(cwd, DEMO_WORKSPACE_DIR);
}

/** Cross-platform read-only listing command for the shell demo step. */
export function demoListCommand(): { command: string; label: string } {
  if (process.platform === "win32") {
    return { command: "dir", label: "dir" };
  }
  return { command: "ls -la", label: "ls -la" };
}

export function buildDemoPrompts(demoPath: string) {
  const helloFile = path.join(demoPath, "hello-atrium.txt");
  const list = demoListCommand();
  return {
    writeFile: `Write a file at ${helloFile} with exactly this content on one line: Atrium demo was here. Call write_file now — do not paste the file contents in chat instead.`,
    shell: `Run the shell command ${list.command} in ${demoPath} using run_shell. Wait for my approval before assuming it ran.`,
  };
}

export type DemoInfo = {
  demoPath: string;
  agentId: string | null;
  agentSlug: string;
  prompts: ReturnType<typeof buildDemoPrompts>;
  bootstrapped: boolean;
};

export type DemoSetupResult = DemoInfo & {
  agentId: string;
  settings: {
    allowedPaths: string[];
    enableShell: boolean;
  };
};

/** Read-only demo metadata — does not touch Settings or create folders. */
export async function getDemoInfo(cwd = process.cwd()): Promise<DemoInfo> {
  const demoPath = demoWorkspacePath(cwd);
  const settings = await getStudioSettings();
  const agent = await prisma.agent.findUnique({
    where: { slug: DEMO_AGENT_SLUG },
  });

  return {
    demoPath,
    agentId: agent?.id ?? null,
    agentSlug: DEMO_AGENT_SLUG,
    prompts: buildDemoPrompts(demoPath),
    bootstrapped:
      settings.allowedPaths.includes(demoPath) && settings.enableShell,
  };
}

export async function bootstrapDemo(cwd = process.cwd()): Promise<DemoSetupResult> {
  const demoPath = demoWorkspacePath(cwd);
  await mkdir(demoPath, { recursive: true });

  const current = await getOrCreateSettings();
  let allowed: string[] = [];
  try {
    const parsed = JSON.parse(current.allowedPaths) as unknown;
    if (Array.isArray(parsed)) {
      allowed = parsed.filter((p): p is string => typeof p === "string");
    }
  } catch {
    allowed = [];
  }
  const alreadyBootstrapped =
    allowed.includes(demoPath) && current.enableShell;

  if (!allowed.includes(demoPath)) allowed.push(demoPath);

  if (!alreadyBootstrapped) {
    await prisma.settings.update({
      where: { id: current.id },
      data: {
        allowedPaths: JSON.stringify(allowed),
        enableShell: true,
      },
    });
  } else if (allowed.join(",") !== current.allowedPaths) {
    await prisma.settings.update({
      where: { id: current.id },
      data: { allowedPaths: JSON.stringify(allowed) },
    });
  }

  const agent = await prisma.agent.findUnique({
    where: { slug: DEMO_AGENT_SLUG },
  });
  if (!agent) {
    throw new Error(
      `Demo agent "${DEMO_AGENT_SLUG}" not found. Run npm run db:seed.`
    );
  }

  const settings = await getStudioSettings();

  return {
    demoPath,
    agentId: agent.id,
    agentSlug: DEMO_AGENT_SLUG,
    prompts: buildDemoPrompts(demoPath),
    bootstrapped: true,
    settings: {
      allowedPaths: settings.allowedPaths,
      enableShell: settings.enableShell,
    },
  };
}
