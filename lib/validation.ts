// Validation rules — a 1:1 port of the Stage 2 Python validators.
// Same limits, same rules, same spirit: specific error messages, nothing
// invalid gets through. Each validator returns { ok, value } or { ok, error }.

export const MIN_NAME_LEN = 2;
export const MAX_NAME_LEN = 40;
export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 10; // per order (all lines combined), as in Stage 2
export const PHONE_LEN = 10;
const PHONE_FIRST_DIGITS = "6789";

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export function validateName(raw: string): Result<string> {
  const name = raw.trim();
  if (!name) return fail("Name cannot be empty or only spaces.");
  if (!/^[A-Za-z ]+$/.test(name))
    return fail("Name may contain only letters and spaces — no digits or symbols.");
  if (name.length < MIN_NAME_LEN)
    return fail(`Name must be at least ${MIN_NAME_LEN} characters long.`);
  if (name.length > MAX_NAME_LEN)
    return fail(`Name must be at most ${MAX_NAME_LEN} characters (you entered ${name.length}).`);
  return { ok: true, value: name.replace(/\s+/g, " ") };
}

export function validatePhone(raw: string): Result<string> {
  const phone = raw.trim().replace(/ /g, "");
  if (!phone) return fail("Phone number cannot be empty.");
  if (!/^\d+$/.test(phone))
    return fail("Phone number may contain digits only — no letters, + or dashes.");
  if (phone.length !== PHONE_LEN)
    return fail(`Phone number must be exactly ${PHONE_LEN} digits (you entered ${phone.length}).`);
  if (!PHONE_FIRST_DIGITS.includes(phone[0]))
    return fail(`Indian mobile numbers start with 6, 7, 8 or 9 — '${phone[0]}' is not valid.`);
  return { ok: true, value: phone };
}

export function validateQuantity(raw: string | number): Result<number> {
  const text = String(raw).trim();
  if (!text) return fail("Quantity cannot be empty. Enter a number from 1 to 10.");
  if (/^-\d+$/.test(text)) return fail("Quantity cannot be negative.");
  if (!/^\d+$/.test(text))
    return fail(`'${text}' is not a whole number. Enter digits only — e.g. 2, not 'two' or 2.5.`);
  const quantity = parseInt(text, 10);
  if (quantity < MIN_QUANTITY) return fail("Quantity must be at least 1 — you cannot order 0 pizzas.");
  if (quantity > MAX_QUANTITY)
    return fail(`Maximum ${MAX_QUANTITY} pizzas per order (you asked for ${quantity}).`);
  return { ok: true, value: quantity };
}

export function validateTotalQuantity(total: number): Result<number> {
  if (total < MIN_QUANTITY) return fail("The order must contain at least 1 pizza.");
  if (total > MAX_QUANTITY)
    return fail(
      `Maximum ${MAX_QUANTITY} pizzas per order — that would take your cart to ${total}. ` +
        "Remove some, or place a second order."
    );
  return { ok: true, value: total };
}
