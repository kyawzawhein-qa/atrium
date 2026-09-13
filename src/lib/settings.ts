import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export const SETTINGS_ID = "singleton";

export type StudioSettings = {
  id: string;
  openrouterApiKey: string | null;
  allowedPaths: string[];
  enableShell: boolean;
  updatedAt: Date;
};

export function parseAllowedPaths(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 10) return "••••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export async function getOrCreateSettings() {
  return prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: {
      id: SETTINGS_ID,
      allowedPaths: "[]",
      enableShell: false,
    },
  });
}

/** Per-install secret for same-origin operator actions; created once in SQLite. */
export async function ensureOperatorToken(): Promise<string> {
  const row = await getOrCreateSettings();
  if (row.operatorToken) return row.operatorToken;

  const token = randomBytes(32).toString("hex");
  const updated = await prisma.settings.update({
    where: { id: SETTINGS_ID },
    data: { operatorToken: token },
  });
  return updated.operatorToken ?? token;
}

export async function getStudioSettings(): Promise<StudioSettings> {
  const row = await getOrCreateSettings();
  return {
    id: row.id,
    openrouterApiKey: row.openrouterApiKey,
    allowedPaths: parseAllowedPaths(row.allowedPaths),
    enableShell: Boolean(row.enableShell),
    updatedAt: row.updatedAt,
  };
}

export function publicSettingsPayload(settings: StudioSettings) {
  const key = settings.openrouterApiKey?.trim() || "";
  return {
    hasKey: key.length > 0,
    keyMasked: key ? maskApiKey(key) : "",
    allowedPaths: settings.allowedPaths,
    enableShell: settings.enableShell,
    updatedAt: settings.updatedAt,
  };
}
