// Billing — the same business rules as Stage 2, generalised to a multi-line cart:
//   unit price   = base + pizza + toppings
//   subtotal     = sum of (unit price x quantity) across lines
//   promo        = a redeemed promo code's discount (percent-off-subtotal, or the
//                  most expensive topping waived on its featured pizza) — computed
//                  on the ORIGINAL subtotal so it never depends on the bulk discount
//   bulk         = 10% of (subtotal - promo) when TOTAL pizzas in the order >= 5
//                  — computed after the promo so the same rupee is never discounted twice
//   GST          = 18% of the post-discount amount
// All arithmetic is on integer paise; rounding is half-up, like the Python Decimal version.

import type { Bill, CartLine, MenuItem } from "./types";

export const DISCOUNT_THRESHOLD = 5; // pizzas — change here to move the threshold
export const DISCOUNT_RATE = 0.1; // 10% bulk discount
export const GST_RATE = 0.18; // 18% GST on the post-discount amount

export const PROMO_DISCOUNT_TYPES = ["percent", "topping"] as const;
export type PromoDiscountType = (typeof PROMO_DISCOUNT_TYPES)[number];
export const PROMO_PERCENT_MIN = 1;
export const PROMO_PERCENT_MAX = 50;

/** The redemption details needed to compute a promo code's effect on a cart. */
export interface AppliedPromo {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number; // percent (1-50); ignored for "topping"
  featuredItemId?: string | null; // pizza id the "topping" discount targets
}

const roundHalfUp = (value: number): number => Math.floor(value + 0.5);

export function unitPricePaise(line: Pick<CartLine, "base" | "pizza" | "toppings">): number {
  return (
    line.base.pricePaise +
    line.pizza.pricePaise +
    line.toppings.reduce((sum, t) => sum + t.pricePaise, 0)
  );
}

export function lineTotalPaise(line: CartLine): number {
  return unitPricePaise(line) * line.quantity;
}

/** The topping a "free topping" promo would waive on a matching line: the priciest one, so it's the best case for the customer. */
function priciestTopping(line: CartLine): MenuItem | null {
  return line.toppings.reduce<MenuItem | null>(
    (max, t) => (!max || t.pricePaise > max.pricePaise ? t : max),
    null
  );
}

function computePromoDiscountPaise(lines: CartLine[], subtotalPaise: number, promo: AppliedPromo): number {
  if (promo.discountType === "percent") {
    return roundHalfUp(subtotalPaise * (promo.discountValue / 100));
  }
  // "topping": waive the priciest topping on the first line using the featured pizza.
  const line = lines.find((l) => l.pizza.id === promo.featuredItemId);
  const topping = line ? priciestTopping(line) : null;
  return topping ? topping.pricePaise : 0;
}

export function computeBill(lines: CartLine[], promo?: AppliedPromo | null): Bill {
  const subtotalPaise = lines.reduce((sum, line) => sum + lineTotalPaise(line), 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const promoDiscountPaise = promo ? computePromoDiscountPaise(lines, subtotalPaise, promo) : 0;
  const bulkDiscountPaise =
    totalQuantity >= DISCOUNT_THRESHOLD
      ? roundHalfUp((subtotalPaise - promoDiscountPaise) * DISCOUNT_RATE)
      : 0;
  const discountPaise = promoDiscountPaise + bulkDiscountPaise;

  const taxablePaise = subtotalPaise - discountPaise;
  const gstPaise = roundHalfUp(taxablePaise * GST_RATE);
  const totalPaise = taxablePaise + gstPaise;

  return {
    subtotalPaise,
    discountPaise,
    bulkDiscountPaise,
    promoDiscountPaise,
    promoCode: promo && promoDiscountPaise > 0 ? promo.code : null,
    taxablePaise,
    gstPaise,
    totalPaise,
    totalQuantity,
  };
}
