export const CURRENCY_SYMBOLS = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF",
  CNY: "¥",
  SGD: "S$",
};

export const getCurrencySymbol = (currency = "USD") => {
  if (!currency) return "$";
  return CURRENCY_SYMBOLS[currency.toUpperCase()] || currency;
};

export const formatCurrency = (amount, currency = "USD") => {
  const sym = getCurrencySymbol(currency);
  const num = Number(amount || 0);
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sym}${formatted}`;
};
