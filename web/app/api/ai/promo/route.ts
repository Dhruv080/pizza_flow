// POST /api/ai/promo — Festival Promo Planner.
// Body: { occasion: string, offer: string, menu: MenuPizzaInfo[], facts: PromoFacts }
// The occasion, the offer and every fact are chosen/computed deterministically
// (occasion calendar + computePromoFacts) — the LLM only writes the broadcast
// copy in strict JSON. Featured items are re-validated against the menu names
// supplied, so a hallucinated item is silently dropped.

import { NextResponse } from "next/server";
import { getAiModel, getAiPrompt, getOpenRouterApiKey, isAiFeatureEnabled } from "@/lib/data";
import { AiUnavailableError, chatCompletion, parseJsonReply } from "@/lib/openrouter";
import type { PromoFacts } from "@/lib/analytics";

interface MenuPizzaInfo {
  name: string;
  priceRupees: number;
  isVeg: boolean;
}

interface PromoReply {
  headline?: string;
  message?: string;
  featuredItems?: string[];
  whyThisWorks?: string;
}

export async function POST(request: Request) {
  if (!(await isAiFeatureEnabled("promo"))) {
    return NextResponse.json(
      { error: "AI features are currently turned off in Admin > Settings > AI." },
      { status: 503 }
    );
  }

  let body: { occasion?: string; offer?: string; menu?: MenuPizzaInfo[]; facts?: PromoFacts };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const occasion = (body.occasion ?? "").trim().slice(0, 300);
  const offer = (body.offer ?? "").trim().slice(0, 200) || "none";
  const menu = (Array.isArray(body.menu) ? body.menu : []).slice(0, 60);
  if (!occasion || !menu.length || !body.facts) {
    return NextResponse.json({ error: "An occasion, the menu and sales facts are required" }, { status: 400 });
  }

  const menuLines = menu
    .map((p) => `${String(p.name).slice(0, 60)} | ₹${Number(p.priceRupees)} | ${p.isVeg ? "veg" : "non-veg"}`)
    .join("\n");

  try {
    const [prompt, model, apiKey] = await Promise.all([
      getAiPrompt("promo"),
      getAiModel(),
      getOpenRouterApiKey(),
    ]);
    const reply = await chatCompletion({
      system: prompt
        .replace("{{OCCASION}}", occasion)
        .replace("{{OFFER}}", offer)
        .replace("{{MENU}}", menuLines)
        .replace("{{FACTS}}", JSON.stringify(body.facts, null, 1)),
      user: "Write the broadcast.",
      jsonMode: true,
      maxTokens: 500,
      model,
      apiKey: apiKey ?? undefined,
    });

    const parsed = parseJsonReply<PromoReply>(reply);
    const message = String(parsed.message ?? "").trim().slice(0, 700);
    if (!message) throw new AiUnavailableError("Empty promo message");

    // Only items that actually exist on the menu survive.
    const menuNames = new Map(menu.map((p) => [String(p.name).toLowerCase(), String(p.name)]));
    const featuredItems = (Array.isArray(parsed.featuredItems) ? parsed.featuredItems : [])
      .map((name) => menuNames.get(String(name).toLowerCase()))
      .filter((name): name is string => Boolean(name))
      .slice(0, 3);

    return NextResponse.json({
      promo: {
        headline: String(parsed.headline ?? "").trim().slice(0, 80),
        message,
        featuredItems,
        whyThisWorks: String(parsed.whyThisWorks ?? "").trim().slice(0, 300),
      },
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "The promo writer is unavailable right now — try again in a minute." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Could not draft the promo — try again." }, { status: 502 });
  }
}
