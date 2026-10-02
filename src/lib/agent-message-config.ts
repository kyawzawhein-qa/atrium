/** Max hops in a single agent-message chain (A→B→C = 3 hops). Fourth hop is refused. */
export function getMaxAgentMessageHops(): number {
  const raw = process.env.ATRIUM_AGENT_MESSAGE_MAX_HOPS;
  if (raw === undefined || raw === "") return 3;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

/** Per-agent outbound messages allowed per rolling minute. */
export function getAgentMessageRateLimitPerMinute(): number {
  const raw = process.env.ATRIUM_AGENT_MESSAGE_RATE_PER_MINUTE;
  if (raw === undefined || raw === "") return 20;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 20;
}

/** Receiver run timeout for the dispatcher (ms). */
export function getAgentMessageDispatchTimeoutMs(): number {
  const raw = process.env.ATRIUM_AGENT_MESSAGE_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 120_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 5_000 ? n : 120_000;
}
