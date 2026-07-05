// POST /api/ai/feedback — Feedback Analyst.
// Body: { entries: FeedbackEntryForAi[], stats: {...} }
// The LLM clusters the feedback into themes but may only cite entries by
// index. Indexes are validated here against the entries actually sent, and
// the UI recomputes every count and quote from them — so the analysis can
// never claim evidence that does not exist.

import { NextResponse } from "next/server";
import { getAiModel, getAiPrompt, getOpenRouterApiKey, isAiFeatureEnabled } from "@/lib/data";
import { AiUnavailableError, chatCompletion, parseJsonReply } from "@/lib/openrouter";
import type { FeedbackAnalysis, FeedbackEntryForAi, FeedbackTheme } from "@/lib/analytics";

const SENTIMENTS = new Set(["negative", "positive", "mixed"]);

export async function POST(request: Request) {
  if (!(await isAiFeatureEnabled("feedback"))) {
    return NextResponse.json(
      { error: "AI features are currently turned off in Admin > Settings > AI." },
      { status: 503 }
    );
  }

  let body: {
    entries?: FeedbackEntryForAi[];
    stats?: { overallAvgRating: number | null; overallRatingCount: number; feedbackCount: number };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const entries = (Array.isArray(body.entries) ? body.entries : []).slice(0, 100).map((e, i) => ({
    index: Number.isInteger(e?.index) ? e.index : i,
    when: String(e?.when ?? "").slice(0, 10),
    dayOfWeek: String(e?.dayOfWeek ?? "").slice(0, 10),
    hour: String(e?.hour ?? "").slice(0, 5),
    overall: typeof e?.overall === "number" ? e.overall : null,
    pizzaRatings: e?.pizzaRatings && typeof e.pizzaRatings === "object" ? e.pizzaRatings : {},
    tags: (Array.isArray(e?.tags) ? e.tags : []).slice(0, 10).map((t) => String(t).slice(0, 40)),
    comment: e?.comment ? String(e.comment).slice(0, 1000) : null,
  }));
  if (!entries.length) {
    return NextResponse.json({ error: "There is no feedback to analyse yet." }, { status: 400 });
  }

  try {
    const [prompt, model, apiKey] = await Promise.all([
      getAiPrompt("feedback"),
      getAiModel(),
      getOpenRouterApiKey(),
    ]);
    const reply = await chatCompletion({
      system: prompt
        .replace("{{STATS}}", JSON.stringify(body.stats ?? {}, null, 1))
        .replace("{{ENTRIES}}", JSON.stringify(entries, null, 1)),
      user: "Analyse the feedback.",
      jsonMode: true,
      maxTokens: 900,
      model,
      apiKey: apiKey ?? undefined,
    });

    const parsed = parseJsonReply<Partial<FeedbackAnalysis>>(reply);
    const validIndexes = new Set(entries.map((e) => e.index));
    const themes: FeedbackTheme[] = (Array.isArray(parsed.themes) ? parsed.themes : [])
      .slice(0, 5)
      .map((t) => ({
        title: String(t?.title ?? "").trim().slice(0, 120),
        sentiment: SENTIMENTS.has(t?.sentiment as string) ? (t.sentiment as FeedbackTheme["sentiment"]) : "mixed",
        entryIndexes: [
          ...new Set(
            (Array.isArray(t?.entryIndexes) ? t.entryIndexes : []).filter(
              (n): n is number => Number.isInteger(n) && validIndexes.has(n)
            )
          ),
        ],
        rootCause: String(t?.rootCause ?? "").trim().slice(0, 400),
        suggestedAction: String(t?.suggestedAction ?? "").trim().slice(0, 400),
        draftReply: String(t?.draftReply ?? "").trim().slice(0, 500),
      }))
      // A theme with no verifiable supporting entry is unsubstantiated — drop it.
      .filter((t) => t.title && t.entryIndexes.length > 0);

    const analysis: FeedbackAnalysis = {
      themes,
      note: String(parsed.note ?? "").trim().slice(0, 400),
    };
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "The feedback analyst is unavailable right now — the raw feedback is in the table below." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not analyse the feedback — try again." }, { status: 502 });
  }
}
