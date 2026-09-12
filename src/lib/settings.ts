import { prisma } from "./prisma";

export const SETTINGS_ID = "singleton";

export type StudioSettings = {
  id: string;
  openrouterApiKey: string | null;
  allowedPaths: string[];
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
    },
  });
}

export async function getStudioSettings(): Promise<StudioSettings> {
  const row = await getOrCreateSettings();
  return {
    id: row.id,
    openrouterApiKey: row.openrouterApiKey,
    allowedPaths: parseAllowedPaths(row.allowedPaths),
    updatedAt: row.updatedAt,
  };
}

export function publicSettingsPayload(settings: StudioSettings) {
  const key = settings.openrouterApiKey?.trim() || "";
  return {
    hasKey: key.length > 0,
    keyMasked: key ? maskApiKey(key) : "",
    allowedPaths: settings.allowedPaths,
    updatedAt: settings.updatedAt,
  };
}
