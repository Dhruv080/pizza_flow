// Billing — the same business rules as Stage 2, generalised to a multi-line cart:
//   unit price = base + pizza + toppings
//   subtotal   = sum of (unit price x quantity) across lines
//   discount   = 10% of subtotal when TOTAL pizzas in the order >= 5
//   GST        = 18% of the post-discount amount
// All arithmetic is on integer paise; rounding is half-up, like the Python Decimal version.

import type { Bill, CartLine } from "./types";

export const DISCOUNT_THRESHOLD = 5; // pizzas — change here to move the threshold
export const DISCOUNT_RATE = 0.1; // 10% bulk discount
export const GST_RATE = 0.18; // 18% GST on the post-discount amount

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

export function computeBill(lines: CartLine[]): Bill {
  const subtotalPaise = lines.reduce((sum, line) => sum + lineTotalPaise(line), 0);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const discountPaise =
    totalQuantity >= DISCOUNT_THRESHOLD ? roundHalfUp(subtotalPaise * DISCOUNT_RATE) : 0;

  const taxablePaise = subtotalPaise - discountPaise;
  const gstPaise = roundHalfUp(taxablePaise * GST_RATE);
  const totalPaise = taxablePaise + gstPaise;

  return { subtotalPaise, discountPaise, taxablePaise, gstPaise, totalPaise, totalQuantity };
}
