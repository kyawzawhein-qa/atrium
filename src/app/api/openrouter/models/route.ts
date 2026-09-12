import { NextResponse } from "next/server";
import { fetchOpenRouterModels, getOpenRouterKey } from "@/lib/openrouter";

export async function GET() {
  const key = await getOpenRouterKey();
  if (!key) {
    return NextResponse.json(
      {
        error: "Add an OpenRouter API key in Settings to load models.",
        models: [],
      },
      { status: 400 }
    );
  }

  try {
    const models = await fetchOpenRouterModels(key);
    return NextResponse.json({
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        contextLength: m.context_length ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load models";
    return NextResponse.json({ error: message, models: [] }, { status: 502 });
  }
}
