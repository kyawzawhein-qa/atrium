/** Max agent-message hops per chain (e.g. A→B→C is 3 messages; hop 4 is refused). */
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
  return Number.isFinite(n) && n >= 50 ? n : 120_000;
}

/**
 * How long the sender's chat request blocks waiting for async handoff replies (ms).
 * Defaults to the dispatch timeout; set lower to return sooner with a queued chip.
 */
export function getAgentMessageSenderWaitTimeoutMs(): number {
  const raw = process.env.ATRIUM_AGENT_MESSAGE_SENDER_WAIT_MS;
  if (raw === undefined || raw === "") return getAgentMessageDispatchTimeoutMs();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 50 ? n : getAgentMessageDispatchTimeoutMs();
}

/** Max concurrent receiver dispatches in this process. */
export function getAgentMessageMaxConcurrent(): number {
  const raw = process.env.ATRIUM_AGENT_MESSAGE_MAX_CONCURRENT;
  if (raw === undefined || raw === "") return 3;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}
