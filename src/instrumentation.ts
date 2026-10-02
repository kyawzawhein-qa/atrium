/**
 * Server boot hook: recover agent-message inbox before handling traffic.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  const { bootAgentMessageDispatcher } = await import("./lib/agent-message-dispatcher");
  await bootAgentMessageDispatcher();
}
