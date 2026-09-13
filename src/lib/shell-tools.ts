/**
 * Allowlisted shell execution for local-first Atrium.
 *
 * WHY: Commands run on the machine hosting Atrium (Node child_process), never in the
 * browser. cwd must resolve inside the same absolute-path allowlist as fs-tools.
 * Dangerous patterns are hard-rejected. Every other command needs operator
 * approval (in-memory Map, 5 min TTL). cwd allowlist is not enough — argv can
 * still read /etc/passwd or run a script written via write_file.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolveIfAllowed } from "./fs-tools";
import { getStudioSettings } from "./settings";

const APPROVAL_TTL_MS = 5 * 60 * 1000;
const MAX_OUTPUT = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ShellResult =
  | {
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
      cwd: string;
      command: string;
    }
  | {
      ok: false;
      error: string;
      code:
        | "not_granted"
        | "outside_allowlist"
        | "dangerous"
        | "needs_approval"
        | "denied"
        | "invalid"
        | "timeout"
        | "failed";
      approvalId?: string;
    };

type PendingApproval = {
  command: string;
  cwd: string;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
  /** Settles with the final ShellResult (exec, deny, or timeout). */
  finish: (result: ShellResult) => void;
  result: Promise<ShellResult>;
};

const globalForApprovals = globalThis as unknown as {
  atriumShellApprovals?: Map<string, PendingApproval>;
};

function approvals(): Map<string, PendingApproval> {
  if (!globalForApprovals.atriumShellApprovals) {
    globalForApprovals.atriumShellApprovals = new Map();
  }
  return globalForApprovals.atriumShellApprovals;
}

const DANGEROUS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+\/(\s|$)/i,
  /\brm\s+-rf\s+\/\s*$/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bhalt\b/i,
  /\binit\s+0\b/i,
  /curl\s+[^|;\n]*\|\s*(ba)?sh\b/i,
  /wget\s+[^|;\n]*\|\s*(ba)?sh\b/i,
  /\bformat\s+[a-z]:/i,
  /\bdiskpart\b/i,
  /\b(ba)?sh\s+-c\s+['\"][^'"]*rm\s+-rf\s+\//i,
  /\b(ba)?sh\s+.*rm\s+-rf\s+\//i,
];

const MUTATING: RegExp[] = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bunlink\b/i,
  /\bdel\b/i,
  /\berase\b/i,
  /\bmove\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bcopy\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+commit\b/i,
  /\bnpm\s+publish\b/i,
  /\bpnpm\s+publish\b/i,
  /\byarn\s+publish\b/i,
  /\bdocker\s+(rm|rmi|prune|system\s+prune)\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bdelete\s+from\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\btee\b/i,
  />\s*[^>|]/,
  />>/,
  /\bapt(-get)?\s+(install|remove|purge)\b/i,
  /\bbrew\s+(install|uninstall)\b/i,
  /\bpip3?\s+install\b/i,
  /\bnpm\s+(install|uninstall|i)\b/i,
  /\btouch\b/i,
  /\bmkdir\b/i,
  /\bsed\s+-i\b/i,
  /\bperl\s+-i\b/i,
];

const READISH =
  /^(ls|dir|pwd|whoami|hostname|uname|date|echo|cat|head|tail|wc|file|stat|du|df|git\s+(status|log|diff|show|branch|remote|rev-parse)|python3?(?:\s+--version|\s+-V)|node\s+-v|npm\s+(?:-v|--version)|which|where|type|env|printenv|id)\b/i;

export function isDangerous(command: string): boolean {
  return DANGEROUS.some((re) => re.test(command.trim()));
}

function hasShellControl(command: string): boolean {
  // Pipes, chaining, and redirects are never "just a read".
  return /[|><;&`]|\$\(|&&|\|\|/.test(command);
}

function isMutating(command: string): boolean {
  const c = command.trim();
  if (hasShellControl(c)) return true;
  if (MUTATING.some((re) => re.test(c))) return true;
  return false;
}

function newApprovalId(): string {
  return randomBytes(12).toString("hex");
}

function registerApproval(
  command: string,
  cwd: string
): { approvalId: string; result: Promise<ShellResult> } {
  const approvalId = newApprovalId();
  let finish: (result: ShellResult) => void = () => {};
  const result = new Promise<ShellResult>((resolve) => {
    finish = resolve;
  });

  const timer = setTimeout(() => {
    const entry = approvals().get(approvalId);
    if (entry) {
      approvals().delete(approvalId);
      entry.finish({
        ok: false,
        error: "Approval timed out.",
        code: "denied",
        approvalId,
      });
    }
  }, APPROVAL_TTL_MS);

  approvals().set(approvalId, {
    command,
    cwd,
    createdAt: Date.now(),
    timer,
    finish: (r) => {
      clearTimeout(timer);
      approvals().delete(approvalId);
      finish(r);
    },
    result,
  });

  return { approvalId, result };
}

/**
 * Operator confirm/deny. Approve always executes here (once) so a dead SSE
 * waiter cannot report success with no command, and two clicks cannot double-run.
 */
export async function resolveShellApproval(
  approvalId: string,
  allow: boolean
): Promise<
  | { ok: true; allowed: false }
  | { ok: true; allowed: true; continued: false; result: ShellResult }
  | { ok: false; error: string }
> {
  const entry = approvals().get(approvalId);
  if (!entry) {
    return { ok: false, error: "Unknown or expired approval id." };
  }

  if (!allow) {
    const denied: ShellResult = {
      ok: false,
      error: "Operator denied this shell command.",
      code: "denied",
      approvalId,
    };
    entry.finish(denied);
    return { ok: true, allowed: false };
  }

  const { command, cwd, finish } = entry;
  approvals().delete(approvalId);
  clearTimeout(entry.timer);
  const result = await execCommand(command, cwd);
  finish(result);
  return { ok: true, allowed: true, continued: false, result };
}

export function peekShellApproval(approvalId: string) {
  const entry = approvals().get(approvalId);
  if (!entry) return null;
  return { command: entry.command, cwd: entry.cwd, createdAt: entry.createdAt };
}

async function execCommand(
  command: string,
  cwd: string
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const finish = (result: ShellResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        ok: false,
        error: `Command timed out after ${DEFAULT_TIMEOUT_MS}ms.`,
        code: "timeout",
      });
    }, DEFAULT_TIMEOUT_MS);

    const append = (target: "out" | "err", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (target === "out") {
        if (stdout.length < MAX_OUTPUT) {
          stdout += text.slice(0, MAX_OUTPUT - stdout.length);
          if (stdout.length >= MAX_OUTPUT) truncated = true;
        }
      } else if (stderr.length < MAX_OUTPUT) {
        stderr += text.slice(0, MAX_OUTPUT - stderr.length);
        if (stderr.length >= MAX_OUTPUT) truncated = true;
      }
    };

    child.stdout?.on("data", (c: Buffer) => append("out", c));
    child.stderr?.on("data", (c: Buffer) => append("err", c));

    child.on("error", (err) => {
      finish({
        ok: false,
        error: err.message || "Failed to spawn shell.",
        code: "failed",
      });
    });

    child.on("close", (code) => {
      const note = truncated ? "\n…(output truncated)" : "";
      finish({
        ok: true,
        stdout: stdout + (truncated && stdout ? note : ""),
        stderr: stderr + (truncated && !stdout ? note : ""),
        exitCode: code ?? 1,
        cwd,
        command,
      });
    });
  });
}

export type RunShellArgs = {
  command?: string;
  cwd?: string;
  approved?: boolean;
};

async function prepareShell(
  args: RunShellArgs
): Promise<
  | { ok: true; command: string; cwd: string }
  | ShellResult
> {
  const settings = await getStudioSettings();
  if (!settings.enableShell || settings.allowedPaths.length === 0) {
    return {
      ok: false,
      error:
        "Shell is not granted. Enable “Allow shell in granted folders” and add at least one path in Settings.",
      code: "not_granted",
    };
  }

  const command = (args.command ?? "").trim();
  if (!command || command.includes("\0")) {
    return { ok: false, error: "Command is required.", code: "invalid" };
  }

  const cwdRaw = (args.cwd ?? settings.allowedPaths[0] ?? "").trim();
  if (!cwdRaw) {
    return { ok: false, error: "cwd is required.", code: "invalid" };
  }

  const check = await resolveIfAllowed(cwdRaw, settings.allowedPaths);
  if (!check.ok) {
    return {
      ok: false,
      error: check.error,
      code: check.code === "outside_allowlist" ? "outside_allowlist" : "not_granted",
    };
  }

  if (isDangerous(command)) {
    return {
      ok: false,
      error: "Command rejected as dangerous (no approval available).",
      code: "dangerous",
    };
  }

  return { ok: true, command, cwd: check.path };
}

/**
 * Run a shell command inside an allowlisted cwd.
 * Every command without prior approval returns needs_approval.
 */
export async function runShellTool(args: RunShellArgs): Promise<ShellResult> {
  const prepared = await prepareShell(args);
  if (!prepared.ok) return prepared;

  if (!args.approved) {
    const { approvalId } = registerApproval(prepared.command, prepared.cwd);
    return {
      ok: false,
      error: "Shell commands need operator approval.",
      code: "needs_approval",
      approvalId,
    };
  }

  return execCommand(prepared.command, prepared.cwd);
}

/**
 * Streaming tool-loop helper: emit needs_approval to the UI, wait for the
 * operator (or TTL), then run or deny. Keeps the SSE request alive so the
 * final answer can stream after confirmation.
 */
export async function runShellWithApprovalGate(
  args: RunShellArgs,
  onNeedsApproval: (info: {
    approvalId: string;
    command: string;
    cwd: string;
  }) => void
): Promise<ShellResult> {
  const prepared = await prepareShell(args);
  if (!prepared.ok) return prepared;

  if (!args.approved) {
    const { approvalId, result } = registerApproval(
      prepared.command,
      prepared.cwd
    );
    onNeedsApproval({
      approvalId,
      command: prepared.command,
      cwd: prepared.cwd,
    });
    return result;
  }

  return execCommand(prepared.command, prepared.cwd);
}

export function shellToolDefinition() {
  return {
    type: "function" as const,
    function: {
      name: "run_shell",
      description:
        "Run a shell command on the machine hosting Atrium. cwd must be an absolute path inside the operator allowlist. Every command requires operator approval. Dangerous commands are always rejected.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute",
          },
          cwd: {
            type: "string",
            description:
              "Absolute working directory inside a granted folder (defaults to first allowlist entry)",
          },
        },
        required: ["command"],
      },
    },
  };
}
