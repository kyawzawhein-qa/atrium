import { getStudioSettings } from "./settings";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const CACHE_MS = 5 * 60 * 1000;

export type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  context_length?: number;
};

type Cache = { at: number; models: OpenRouterModel[] };

const globalForModels = globalThis as unknown as { atriumModelsCache?: Cache };

function openRouterHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.ATRIUM_PUBLIC_URL || "https://atrium.local",
    "X-Title": "Atrium",
  };
}

export function isChatCapable(model: OpenRouterModel): boolean {
  const arch = model.architecture;
  if (!arch) return true;
  const outputs = arch.output_modalities ?? [];
  if (outputs.length > 0) {
    return outputs.includes("text") && !outputs.includes("embeddings");
  }
  const modality = arch.modality ?? "";
  if (modality.includes("embedding")) return false;
  if (modality.includes("->")) return /->\s*text/.test(modality);
  return true;
}

export async function getOpenRouterKey(): Promise<string | null> {
  const settings = await getStudioSettings();
  const key = settings.openrouterApiKey?.trim() || "";
  return key || null;
}

export async function fetchOpenRouterModels(
  apiKey: string
): Promise<OpenRouterModel[]> {
  const cached = globalForModels.atriumModelsCache;
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.models;
  }

  const res = await fetch(`${OPENROUTER_BASE}/models`, {
    headers: openRouterHeaders(apiKey),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenRouter models error ${res.status}: ${body.slice(0, 180)}`
    );
  }
  const data = (await res.json()) as { data?: OpenRouterModel[] };
  const models = (data.data ?? []).filter(isChatCapable);
  globalForModels.atriumModelsCache = { at: Date.now(), models };
  return models;
}

export { OPENROUTER_BASE, openRouterHeaders };
