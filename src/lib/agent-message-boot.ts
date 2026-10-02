import { randomUUID } from "node:crypto";

const GLOBAL_BOOT_KEY = "__atriumAgentMessageBootState";

type BootState = {
  bootId: string;
  sweepCompleted: boolean;
};

function bootState(): BootState {
  const g = globalThis as unknown as Record<string, BootState | undefined>;
  if (!g[GLOBAL_BOOT_KEY]) {
    g[GLOBAL_BOOT_KEY] = {
      bootId: randomUUID(),
      sweepCompleted: false,
    };
  }
  return g[GLOBAL_BOOT_KEY]!;
}

export function getAgentMessageBootId(): string {
  return bootState().bootId;
}

export function hasAgentMessageSweepCompleted(): boolean {
  return bootState().sweepCompleted;
}

export function markAgentMessageSweepCompleted(): void {
  bootState().sweepCompleted = true;
}

/** Test-only: simulate a prior process boot id. */
export function setAgentMessageBootIdForTests(bootId: string): void {
  bootState().bootId = bootId;
}

export function resetAgentMessageBootStateForTests(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g[GLOBAL_BOOT_KEY];
}
