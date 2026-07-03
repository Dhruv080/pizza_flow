// POST /api/ai/upsell — one add-on suggestion at checkout.
// Body: { cart: {pizzaName, baseName, toppingNames, quantity}[], toppings: MenuItem[] }
// Returns { toppingId, reason } or nulls. Ignoring the suggestion costs nothing.

import { NextResponse } from "next/server";
import { isAiEnabled } from "@/lib/data";
import { UPSELL_SYSTEM_PROMPT } from "@/lib/prompts";
import { AiUnavailableError, chatCompletion, parseJsonReply } from "@/lib/openrouter";
import type { MenuItem } from "@/lib/types";

export async function POST(request: Request) {
  // Upsell is pure enhancement, so the kill switch just means "no suggestion".
  if (!(await isAiEnabled())) {
    return NextResponse.json({ toppingId: null, reason: "" }, { status: 503 });
  }

  let body: {
    cart?: { pizzaName: string; baseName: string; toppingNames: string[]; quantity: number }[];
    toppings?: MenuItem[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const cart = body.cart ?? [];
  const toppings = body.toppings ?? [];
  if (!cart.length || !toppings.length) {
    return NextResponse.json({ toppingId: null, reason: "" });
  }

  const toppingsText = toppings
    .map((t) => `${t.id} | ${t.name} | ${(t.pricePaise / 100).toFixed(2)}`)
    .join("\n");
  const cartText = cart
    .map(
      (l) =>
        `${l.quantity}x ${l.pizzaName} on ${l.baseName}` +
        (l.toppingNames.length ? ` with ${l.toppingNames.join(", ")}` : "")
    )
    .join("\n");

  try {
    const reply = await chatCompletion({
      system: UPSELL_SYSTEM_PROMPT.replace("{{TOPPINGS}}", toppingsText).replace(
        "{{CART}}",
        cartText
      ),
      user: "Suggest one add-on for this cart.",
      jsonMode: true,
      maxTokens: 200,
    });
    const suggestion = parseJsonReply<{ toppingId?: string | null; reason?: string }>(reply);
    const valid = toppings.find((t) => t.id === suggestion.toppingId);
    // A hallucinated id is silently dropped — the customer just sees no suggestion.
    return NextResponse.json(
      valid
        ? { toppingId: valid.id, reason: (suggestion.reason ?? "").slice(0, 200) }
        : { toppingId: null, reason: "" }
    );
  } catch (error) {
    const status = error instanceof AiUnavailableError ? 503 : 502;
    // Upsell is pure enhancement: any failure means simply "no suggestion".
    return NextResponse.json({ toppingId: null, reason: "" }, { status });
  }
}
