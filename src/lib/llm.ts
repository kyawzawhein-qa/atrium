import { extractToolMentions } from "./tools";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmResult = {
  content: string;
  toolHints: string[];
  provider: "openai" | "ollama" | "offline";
};

type AgentVoice = {
  name: string;
  title: string;
  slug: string;
};

function buildOfflineReply(
  agent: AgentVoice,
  history: ChatMessage[],
  userText: string
): string {
  const lower = userText.toLowerCase();
  const lastUser = userText.trim().slice(0, 280);

  if (agent.slug === "senior-developer") {
    if (/bug|error|crash|fail/.test(lower)) {
      return [
        `*(offline demo — no LLM key configured)*`,
        ``,
        `Mara here. For “${lastUser}”, I’d start with a narrow reproduction:`,
        `1. Capture the exact failing input and stack frame.`,
        `2. Bisect recent changes around that module.`,
        `3. Add a regression test before the fix lands.`,
        ``,
        `If you share a snippet or stack trace, I’ll sketch a concrete patch outline. You can also ask me to \`code_search\` once tools are connected.`,
      ].join("\n");
    }
    if (/arch|design|api|schema/.test(lower)) {
      return [
        `*(offline demo — no LLM key configured)*`,
        ``,
        `Thinking in boundaries for “${lastUser}”: keep write paths thin, push validation to the edge, and name invariants in the schema—not in tribal knowledge.`,
        ``,
        `Proposed shape: request DTO → domain service → persistence adapter. Happy to outline interfaces next.`,
      ].join("\n");
    }
    return [
      `*(offline demo — no LLM key configured)*`,
      ``,
      `Got it — “${lastUser}”. I’d break this into a small vertical slice: contract, happy-path implementation, then failure modes.`,
      `Tell me the stack and constraints (latency, team size, deadline) and I’ll give a tighter plan.`,
    ].join("\n");
  }

  if (agent.slug === "graphic-designer") {
    if (/logo|brand|color|palette/.test(lower)) {
      return [
        `*(offline demo — no LLM key configured)*`,
        ``,
        `Theo here. For “${lastUser}”, start with one ink-dark base, one coastal accent, and a single warm highlight—three is enough.`,
        `Typography: a calm humanist sans for UI, a restrained serif only for display moments.`,
        `I can draft a mini board on \`sketch_board\` when that tool is wired.`,
      ].join("\n");
    }
    return [
      `*(offline demo — no LLM key configured)*`,
      ``,
      `Looking at “${lastUser}”: prioritize hierarchy first (what eyes hit in 0.5s), then spacing rhythm (8pt), then decoration last.`,
      `Share the medium (web, print, slide) and I’ll propose a layout grid with two alternatives.`,
    ].join("\n");
  }

  // QA Automation
  if (/test|e2e|cypress|playwright|assert/.test(lower)) {
    return [
      `*(offline demo — no LLM key configured)*`,
      ``,
      `Imani here. For “${lastUser}”, risk-rank first: auth, money/path-critical flows, then cosmetics.`,
      `Suggested suite skeleton: smoke → happy path → negative → permission matrix.`,
      `When \`test_runner\` is connected I can dry-run; for now, I can draft cases as a checklist.`,
    ].join("\n");
  }

  const prior = history.filter((m) => m.role === "user").length;
  return [
    `*(offline demo — no LLM key configured)*`,
    ``,
    `Noted (${prior} user turn${prior === 1 ? "" : "s"} so far): “${lastUser}”.`,
    `I’ll treat this as a QA brief—clarify acceptance criteria, then list edge cases and observability hooks.`,
    `What does “done” look like for this change?`,
  ].join("\n");
}

async function callOpenAI(
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const key = process.env.OPENAI_API_KEY!;
  const base =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ||
    "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI-compatible error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "(empty response)";
}

async function callOllama(messages: ChatMessage[]): Promise<string> {
  const base = process.env.OLLAMA_BASE_URL!.replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.2";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content?.trim() || "(empty response)";
}

export async function generateAssistantReply(opts: {
  agent: AgentVoice & { systemPrompt: string };
  history: ChatMessage[];
  userText: string;
}): Promise<LlmResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: opts.agent.systemPrompt },
    ...opts.history.filter((m) => m.role !== "system"),
    { role: "user", content: opts.userText },
  ];

  if (process.env.OPENAI_API_KEY) {
    const content = await callOpenAI(messages);
    return {
      content,
      toolHints: extractToolMentions(content),
      provider: "openai",
    };
  }

  if (process.env.OLLAMA_BASE_URL) {
    const content = await callOllama(messages);
    return {
      content,
      toolHints: extractToolMentions(content),
      provider: "ollama",
    };
  }

  const content = buildOfflineReply(opts.agent, opts.history, opts.userText);
  return {
    content,
    toolHints: extractToolMentions(content),
    provider: "offline",
  };
}
