import { NextResponse } from "next/server";
import { bootstrapDemo } from "@/lib/demo";

export async function POST() {
  try {
    const result = await bootstrapDemo();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo setup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await bootstrapDemo();
    return NextResponse.json({
      demoPath: result.demoPath,
      agentSlug: result.agentSlug,
      prompts: result.prompts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo setup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
