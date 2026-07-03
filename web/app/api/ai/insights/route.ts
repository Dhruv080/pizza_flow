// POST /api/ai/insights — Owner Insights Copilot.
// Body: { question: string, aggregates: OrderAggregates }
// The aggregates are computed deterministically from the orders table;
// the LLM only narrates them. It never touches the database.

import { NextResponse } from "next/server";
import { getAiModel, getAiPrompt, isAiFeatureEnabled } from "@/lib/data";
import { AiUnavailableError, chatCompletion } from "@/lib/openrouter";
import type { OrderAggregates } from "@/lib/analytics";

export async function POST(request: Request) {
  if (!(await isAiFeatureEnabled("insights"))) {
    return NextResponse.json(
      { error: "AI features are currently turned off in Admin > Settings > AI." },
      { status: 503 }
    );
  }

  let body: { question?: string; aggregates?: OrderAggregates };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const question = (body.question ?? "").trim().slice(0, 300);
  const aggregates = body.aggregates;
  if (!question || !aggregates) {
    return NextResponse.json({ error: "A question and sales data are required" }, { status: 400 });
  }

  try {
    const [prompt, model] = await Promise.all([getAiPrompt("insights"), getAiModel()]);
    const answer = await chatCompletion({
      system: prompt
        .replace("{{GENERATED_AT}}", aggregates.generatedAt)
        .replace("{{AGGREGATES}}", JSON.stringify(aggregates, null, 1)),
      user: question,
      maxTokens: 400,
      model,
    });
    return NextResponse.json({ answer });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "The copilot is unavailable right now. The orders table below has all the raw data." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not answer that — please rephrase." }, { status: 502 });
  }
}
