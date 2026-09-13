/**
 * Durable shell approval records in SQLite.
 *
 * WHY: In-memory waiters die on restart; the operator must still be able to
 * approve or deny a pending command from the UI after refresh/restart.
 */

import { prisma } from "./prisma";

export type StoredShellApproval = {
  id: string;
  command: string;
  cwd: string;
  status: string;
  createdAt: Date;
  expiresAt: Date;
};

export async function createStoredApproval(
  id: string,
  command: string,
  cwd: string,
  expiresAt: Date
): Promise<void> {
  await prisma.shellApproval.create({
    data: {
      id,
      command,
      cwd,
      status: "pending",
      expiresAt,
    },
  });
}

export async function getStoredPendingApproval(
  id: string
): Promise<StoredShellApproval | null> {
  const row = await prisma.shellApproval.findUnique({ where: { id } });
  if (!row || row.status !== "pending") return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await markStoredApproval(id, "expired");
    return null;
  }
  return row;
}

export async function markStoredApproval(
  id: string,
  status: "approved" | "denied" | "expired" | "completed"
): Promise<void> {
  try {
    await prisma.shellApproval.update({
      where: { id },
      data: { status },
    });
  } catch {
    // Row may already be gone; approval path treats that as unknown id.
  }
}

export async function expireStoredApproval(id: string): Promise<void> {
  await markStoredApproval(id, "expired");
}

/** Remove stale pending rows (housekeeping). */
export async function purgeExpiredApprovals(): Promise<number> {
  const result = await prisma.shellApproval.updateMany({
    where: {
      status: "pending",
      expiresAt: { lte: new Date() },
    },
    data: { status: "expired" },
  });
  return result.count;
}
