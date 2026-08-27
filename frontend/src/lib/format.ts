const LOCALES: Record<string, string> = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  AED: "en-AE",
  SGD: "en-SG",
  AUD: "en-AU",
  CAD: "en-CA",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED ",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
};

export function currencySymbol(code = "INR"): string {
  return CURRENCY_SYMBOLS[code?.toUpperCase()] ?? "";
}

export function formatMoney(
  value: number | null | undefined,
  currency = "INR",
  options: { decimals?: boolean; compact?: boolean; signed?: boolean } = {},
): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;

  if (options.compact && Math.abs(safe) >= 1000) {
    const sign = options.signed && safe > 0 ? "+" : safe < 0 ? "-" : "";
    return `${sign}${currencySymbol(currency)}${compactNumber(Math.abs(safe), currency)}`;
  }

  try {
    const formatted = new Intl.NumberFormat(LOCALES[currency?.toUpperCase()] ?? "en-US", {
      style: "currency",
      currency: (currency || "INR").toUpperCase(),
      minimumFractionDigits: options.decimals ? 2 : 0,
      maximumFractionDigits: options.decimals ? 2 : 0,
    }).format(safe);
    return options.signed && safe > 0 ? `+${formatted}` : formatted;
  } catch {
    return `${currencySymbol(currency)}${safe.toLocaleString()}`;
  }
}

/**
 * Indian numbering (K / L / Cr) for INR, western (K / M / B) elsewhere -
 * a lakh reads wrong as "0.1M" to the audience this app is built for.
 */
export function compactNumber(value: number, currency = "INR"): string {
  const abs = Math.abs(value);
  const trim = (n: number) => Number(n.toFixed(n >= 100 ? 0 : 1)).toString();

  if ((currency || "INR").toUpperCase() === "INR") {
    if (abs >= 1e7) return `${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${trim(abs / 1e5)}L`;
    if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
  } else {
    if (abs >= 1e9) return `${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${trim(abs / 1e6)}M`;
    if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
  }
  return trim(abs);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  const n = Number(value ?? 0);
  return `${(Number.isFinite(n) ? n : 0).toFixed(decimals)}%`;
}

export function formatSignedPercent(value: number | null | undefined, decimals = 1): string {
  const n = Number(value ?? 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function formatDate(value: string | Date | null | undefined, style: "short" | "long" | "month" = "short") {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  if (style === "long") {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  }
  if (style === "month") {
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatRelativeDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

/** yyyy-mm-dd for <input type="date">, using local time rather than UTC. */
export function toDateInput(value: string | Date = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

/** Turns a date input value into an ISO datetime the API accepts. */
export function fromDateInput(value: string): string {
  if (!value) return new Date().toISOString();
  const now = new Date();
  const d = new Date(`${value}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
