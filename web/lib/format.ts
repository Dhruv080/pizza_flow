// Formatting helpers. Paise -> "₹1,290.92" using the Indian numbering system.

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export const formatPaise = (paise: number): string => inr.format(paise / 100);

export const rupeesToPaise = (rupees: number | string): number =>
  Math.round(parseFloat(String(rupees)) * 100);

export const paiseToRupees = (paise: number): number => paise / 100;

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
