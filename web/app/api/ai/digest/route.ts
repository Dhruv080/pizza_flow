// POST /api/ai/digest — End-of-Day Digest.
// Body: { aggregates: OrderAggregates } (today's orders only, computed client-side
// from the same orders the admin table displays). The LLM writes the report;
// every number in it comes from the aggregates.

import { NextResponse } from "next/server";
import { isAiEnabled } from "@/lib/data";
import { DIGEST_SYSTEM_PROMPT } from "@/lib/prompts";
import { AiUnavailableError, chatCompletion } from "@/lib/openrouter";
import type { OrderAggregates } from "@/lib/analytics";

export async function POST(request: Request) {
  if (!(await isAiEnabled())) {
    return NextResponse.json(
      { error: "AI features are currently turned off in Admin > Settings > AI." },
      { status: 503 }
    );
  }

  let body: { aggregates?: OrderAggregates };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.aggregates) {
    return NextResponse.json({ error: "Sales data is required" }, { status: 400 });
  }

  try {
    const digest = await chatCompletion({
      system: DIGEST_SYSTEM_PROMPT.replace("{{AGGREGATES}}", JSON.stringify(body.aggregates, null, 1)),
      user: "Write today's end-of-day report.",
      maxTokens: 400,
    });
    return NextResponse.json({ digest });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "The digest writer is unavailable right now — today's totals are visible in the table." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not generate the digest — try again." }, { status: 502 });
  }
}
