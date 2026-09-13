import { mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { getOrCreateSettings, getStudioSettings } from "./settings";

export const DEMO_AGENT_SLUG = "launch-demo";
export const DEMO_WORKSPACE_DIR = "demo-workspace";

export function demoWorkspacePath(cwd = process.cwd()): string {
  return path.join(cwd, DEMO_WORKSPACE_DIR);
}

export type DemoSetupResult = {
  demoPath: string;
  agentId: string;
  agentSlug: string;
  prompts: {
    writeFile: string;
    shell: string;
  };
  settings: {
    allowedPaths: string[];
    enableShell: boolean;
  };
};

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
  if (!allowed.includes(demoPath)) allowed.push(demoPath);

  await prisma.settings.update({
    where: { id: current.id },
    data: {
      allowedPaths: JSON.stringify(allowed),
      enableShell: true,
    },
  });

  const agent = await prisma.agent.findUnique({
    where: { slug: DEMO_AGENT_SLUG },
  });
  if (!agent) {
    throw new Error(
      `Demo agent "${DEMO_AGENT_SLUG}" not found. Run npm run db:seed.`
    );
  }

  const settings = await getStudioSettings();
  const helloFile = path.join(demoPath, "hello-atrium.txt");

  return {
    demoPath,
    agentId: agent.id,
    agentSlug: DEMO_AGENT_SLUG,
    prompts: {
      writeFile: `Write a file at ${helloFile} with exactly this content on one line: Atrium demo was here. Call write_file now — do not paste the file contents in chat instead.`,
      shell: `Run the shell command ls -la in ${demoPath} using run_shell. Wait for my approval before assuming it ran.`,
    },
    settings: {
      allowedPaths: settings.allowedPaths,
      enableShell: settings.enableShell,
    },
  };
}
