// POST /api/ai/promo — Festival Promo Planner.
// Body: { occasion: string, code: string, discount: {type, value, featuredItemName}, menu, facts }
// The occasion, the code and the discount are all chosen/computed deterministically
// by the admin (occasion calendar, the discount type/value/pizza they picked,
// computePromoFacts) — the server turns the discount into one fixed DISCOUNT
// sentence and the LLM only writes the banner copy around it, in strict JSON.
// Featured items are re-validated against the menu names supplied, the code is
// enforced to appear verbatim in the message, so nothing shown to a customer can
// be hallucinated.

import { NextResponse } from "next/server";
import { getAiModel, getAiPrompt, getOpenRouterApiKey, isAiFeatureEnabled } from "@/lib/data";
import { AiUnavailableError, chatCompletion, parseJsonReply } from "@/lib/openrouter";
import type { PromoFacts } from "@/lib/analytics";

interface MenuPizzaInfo {
  name: string;
  priceRupees: number;
  isVeg: boolean;
}

interface DiscountInput {
  type?: "percent" | "topping";
  value?: number;
  featuredItemName?: string;
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

  let body: { occasion?: string; code?: string; discount?: DiscountInput; menu?: MenuPizzaInfo[]; facts?: PromoFacts };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const occasion = (body.occasion ?? "").trim().slice(0, 300);
  const code = (body.code ?? "").trim().toUpperCase().slice(0, 12);
  const menu = (Array.isArray(body.menu) ? body.menu : []).slice(0, 60);
  const discount = body.discount;
  if (!occasion || !code || !menu.length || !body.facts || !discount) {
    return NextResponse.json(
      { error: "An occasion, a code, the discount, the menu and sales facts are required" },
      { status: 400 }
    );
  }

  // The AI never sees "percent" / "topping" / raw numbers to combine itself —
  // the server writes the one sentence it is allowed to restate, so it cannot
  // invent a different discount even by miscalculating.
  const discountText =
    discount.type === "percent"
      ? `${Math.round(Number(discount.value))}% off the whole order`
      : `a free topping of your choice on ${String(discount.featuredItemName ?? "the featured pizza").slice(0, 60)}`;

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
        .replace("{{DISCOUNT}}", discountText)
        .replace("{{CODE}}", code)
        .replace("{{MENU}}", menuLines)
        .replace("{{FACTS}}", JSON.stringify(body.facts, null, 1)),
      user: "Write the banner.",
      jsonMode: true,
      maxTokens: 400,
      model,
      apiKey: apiKey ?? undefined,
    });

    const parsed = parseJsonReply<PromoReply>(reply);
    let message = String(parsed.message ?? "").trim().slice(0, 400);
    if (!message) throw new AiUnavailableError("Empty promo message");
    // The code is how the discount is actually redeemed — never trust the model
    // to have included it; append it deterministically if it didn't.
    if (!message.toUpperCase().includes(code)) {
      message = `${message} Use code ${code} at checkout.`;
    }

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
