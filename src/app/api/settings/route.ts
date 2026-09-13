import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateSettings,
  getStudioSettings,
  publicSettingsPayload,
} from "@/lib/settings";

function looksAbsolute(p: string): boolean {
  if (p.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith("\\\\")) return true;
  return false;
}

export async function GET() {
  const settings = await getStudioSettings();
  return NextResponse.json({ settings: publicSettingsPayload(settings) });
}

export async function PATCH(req: NextRequest) {
  let body: {
    openrouterApiKey?: string;
    allowedPaths?: string[];
    addPath?: string;
    removePath?: string;
    clearKey?: boolean;
    enableShell?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await getOrCreateSettings();
  let allowed = (() => {
    try {
      const parsed = JSON.parse(current.allowedPaths) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((p): p is string => typeof p === "string")
        : [];
    } catch {
      return [] as string[];
    }
  })();

  if (Array.isArray(body.allowedPaths)) {
    allowed = body.allowedPaths
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter(Boolean);
    const bad = allowed.find((p) => !looksAbsolute(p));
    if (bad) {
      return NextResponse.json(
        { error: "Allowed paths must be absolute." },
        { status: 400 }
      );
    }
  }

  if (typeof body.addPath === "string") {
    const p = body.addPath.trim();
    if (!p) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }
    if (!looksAbsolute(p)) {
      return NextResponse.json(
        { error: "Path must be absolute (e.g. /home/you/work or C:\\Users\\you\\work)." },
        { status: 400 }
      );
    }
    if (!allowed.includes(p)) allowed.push(p);
  }

  if (typeof body.removePath === "string") {
    allowed = allowed.filter((p) => p !== body.removePath);
  }

  const data: {
    openrouterApiKey?: string | null;
    allowedPaths: string;
    enableShell?: boolean;
  } = {
    allowedPaths: JSON.stringify(allowed),
  };

  if (body.clearKey === true) {
    data.openrouterApiKey = null;
  } else if (typeof body.openrouterApiKey === "string") {
    const next = body.openrouterApiKey.trim();
    if (next) {
      data.openrouterApiKey = next;
    }
  }

  if (typeof body.enableShell === "boolean") {
    data.enableShell = body.enableShell;
  }

  await prisma.settings.update({
    where: { id: current.id },
    data,
  });

  const settings = await getStudioSettings();
  return NextResponse.json({ settings: publicSettingsPayload(settings) });
}
