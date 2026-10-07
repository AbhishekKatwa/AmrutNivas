/**
 * Integer minor-unit money.
 *
 * THE RULE: money is always `bigint` in the currency's minor unit (paise for a
 * 2-decimal currency). Never a `number`, never a `float`, never a `double`.
 * Binary floating point cannot represent 0.1 or 0.2, so `0.1 + 0.2 !== 0.3` and
 * every bill, folio and GST return built on it drifts by fractions of a paisa
 * that become real reconciliation errors at volume.
 */

export type Paise = bigint;

/**
 * A money value plus the currency it is denominated in. The currency travels
 * with the amount: a total of 1000 means nothing without knowing whether that
 * is 10.00 INR or 1000 JPY (zero-decimal).
 */
export type Money = {
  readonly minor: Paise;
  readonly currency: CurrencyCode;
};

export type CurrencyCode = string;

type CurrencySpec = {
  /** Digits after the decimal point, i.e. how many minor units per major unit. */
  readonly exponent: number;
  readonly symbol: string;
};

/**
 * Known currency metadata. Intentionally a small, extensible map rather than a
 * full ISO table — an unknown currency code still formats (via Intl) and is
 * treated as a 2-decimal currency, so nothing is India-locked.
 */
const CURRENCIES: Record<string, CurrencySpec> = {
  INR: { exponent: 2, symbol: "₹" },
  USD: { exponent: 2, symbol: "$" },
  EUR: { exponent: 2, symbol: "€" },
  GBP: { exponent: 2, symbol: "£" },
  AED: { exponent: 2, symbol: "AED" },
  SGD: { exponent: 2, symbol: "S$" },
  JPY: { exponent: 0, symbol: "¥" },
};

function specFor(currency: CurrencyCode): CurrencySpec {
  return CURRENCIES[currency] ?? { exponent: 2, symbol: currency };
}

/** Base currency for this build. Callers must still pass it explicitly. */
export const FALLBACK_CURRENCY: CurrencyCode = "INR";

export function moneyFromPaise(minor: Paise, currency: CurrencyCode = FALLBACK_CURRENCY): Money {
  return { minor, currency };
}

/**
 * Parse a decimal *string* into minor units.
 *
 * WHY A STRING AND NOT A NUMBER: `moneyFromRupees(123.45)` would first have to
 * multiply a float by 100, and `123.45 * 100 === 12344.999999999998` in IEEE-754
 * — the error is introduced before we ever get to do arithmetic. Parsing the
 * textual digits keeps the conversion exact. UI inputs and API payloads are
 * already strings for this reason.
 *
 * Fraction digits beyond the currency's exponent are rejected rather than
 * silently rounded: losing a fraction of a paisa in a tax calculation is not a
 * rounding detail, it is a wrong number.
 */
export function moneyFromRupees(
  amount: string,
  currency: CurrencyCode = FALLBACK_CURRENCY,
): Money {
  const trimmed = amount.trim();
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid amount: "${amount}" is not a decimal number`);
  }
  const [, sign, wholeDigits, fracDigits = ""] = match;
  if (wholeDigits === "" && fracDigits === "") {
    throw new Error(`Invalid amount: "${amount}" has no digits`);
  }
  const { exponent } = specFor(currency);
  if (fracDigits.length > exponent) {
    throw new Error(
      `Invalid amount: "${amount}" has ${fracDigits.length} fraction digits, ` +
        `${currency} supports ${exponent}`,
    );
  }
  const whole = wholeDigits === "" ? "0" : wholeDigits;
  const paddedFrac = fracDigits.padEnd(exponent, "0");
  const minor = BigInt(whole) * 10n ** BigInt(exponent) + BigInt(paddedFrac || "0");
  return { minor: sign === "-" ? -minor : minor, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

/**
 * Split `totalPaise` into `parts` shares with NO DRIFT.
 *
 * A naive `total / parts` truncates every share and silently loses the
 * remainder (100 paise across 3 shares gives 33+33+33 = 99). The remainder is
 * handed out one minor unit at a time to the lowest-index shares, so the result
 * is deterministic, reproducible on any platform, and sums exactly to the total.
 *
 * `parts` must be a positive integer.
 */
export function splitMoney(total: Paise, parts: number): Paise[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error(`Cannot split money into ${parts} parts`);
  }
  const divisor = BigInt(parts);
  // BigInt division truncates toward zero, so the remainder carries the sign.
  const base = total / divisor;
  const remainder = total - base * divisor;
  const leftoverUnits = Number(remainder < 0n ? -remainder : remainder);
  const direction = remainder < 0n ? -1n : 1n;
  const shares: Paise[] = [];
  for (let i = 0; i < parts; i += 1) {
    // The leftover units go to the lowest-index shares, one each.
    shares.push(i < leftoverUnits ? base + direction : base);
  }
  return shares;
}

export type FormatMoneyOptions = {
  readonly currency?: CurrencyCode;
  readonly locale?: string;
};

/**
 * Which decimal separator a locale writes. Probed with one fixed sample value:
 * the sample is never a money amount and never reaches the output — it only
 * tells us whether this locale prints "1,50" or "1.50". Grouping comes from the
 * `Intl` formatting of the real `bigint` value below.
 */
function decimalSeparatorFor(locale: string): string {
  const parts = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(1000.5);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * Format minor units for display.
 *
 * The integer part stays a `bigint` all the way into `Intl.NumberFormat`, which
 * formats BigInt exactly. We never reconstruct a float for the major unit.
 * Grouping defaults to `en-IN` (lakh/crore: 1,23,45,678.90) but `locale` and
 * `currency` are parameters, so a non-Indian property is a call-site change.
 */
export function formatMoney(value: Paise | Money, options: FormatMoneyOptions = {}): string {
  const minor = typeof value === "bigint" ? value : value.minor;
  const currency =
    typeof value === "bigint" ? (options.currency ?? FALLBACK_CURRENCY) : value.currency;
  const locale = options.locale ?? "en-IN";
  const { exponent, symbol } = specFor(currency);

  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const unitScale = 10n ** BigInt(exponent);
  const wholePart = absolute / unitScale;
  const fracPart = absolute % unitScale;

  const grouped = new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(wholePart);

  const fraction =
    exponent > 0
      ? `${decimalSeparatorFor(locale)}${fracPart.toString().padStart(exponent, "0")}`
      : "";
  return `${negative ? "-" : ""}${symbol}${grouped}${fraction}`;
}

/**
 * Guard used at boundaries (parsing untrusted input, reading legacy state) to
 * reject a floating-point amount that was passed where minor units were
 * required. Not a runtime type system — a loud failure instead of a quiet cent
 * error.
 */
export function assertNoFloatMoney(value: unknown, context: string): Paise {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(
        `${context}: received float ${value} where integer minor units were required`,
      );
    }
    return BigInt(value);
  }
  if (typeof value === "bigint") return value;
  throw new Error(`${context}: expected minor units as bigint or integer, got ${typeof value}`);
}

/* ------------------------------------------------- restaurant order arithmetic */

/*
 * The pieces Prompt #04's order entry needs on top of the amount type above. A POS
 * line is one unit price times a whole count, a discount is a percentage of a line or
 * a bill, and the pay screen owes a person the difference between what they handed
 * over and what the bill came to — so those three live here rather than in each
 * screen, where they would each invent their own rounding.
 */

/**
 * `unitPrice × quantity`. §31 wants a positive whole count, so a zero, a fraction,
 * `NaN` or `Infinity` is refused here rather than becoming a negative line later.
 */
export function multiplyMoneyByQuantity(amount: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive whole count of items, got ${quantity}`);
  }
  return { minor: amount.minor * BigInt(quantity), currency: amount.currency };
}

/**
 * `amount × percent`, rounded half away from zero at the smallest coin.
 *
 * `percent` is a decimal STRING ("12.5", "5", "0.25") with at most two fraction
 * digits, and it becomes whole basis points before any multiplication — so the
 * percentage never enters a float either. Half-up rather than banker's rounding
 * because a discount a cashier can predict by hand beats one that is statistically
 * fairer: on a paisa tie, ₹0.03 at 50% is ₹0.02, and at 50.001%… there is no such
 * field, so the rule a person can reproduce is the one worth having.
 */
export function percentOfMoney(amount: Money, percent: string): Money {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(percent.trim());
  if (!match) {
    throw new Error(
      `Percent must be a decimal with at most 2 fraction digits, got "${percent}"`,
    );
  }
  // The fraction is hundredths of a percent, so "2.5" is 250 basis points and not
  // 205 — the same pad-to-the-exponent the paisa parser above uses.
  const basisPoints = BigInt(match[1]) * 100n + BigInt((match[2] ?? "0").padEnd(2, "0"));
  return {
    minor: divideRoundHalfAway(amount.minor * basisPoints, 10000n),
    currency: amount.currency,
  };
}

/**
 * BigInt division truncates toward zero, so a remainder of at least half a
 * denominator has to be added by hand. Ties go away from zero, for both signs.
 */
function divideRoundHalfAway(numerator: Paise, denominator: bigint): Paise {
  const quotient = numerator / denominator;
  const remainder = numerator - quotient * denominator;
  if (remainder === 0n) return quotient;
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twiceRemainder < denominator) return quotient;
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

/**
 * The pay screen's two possible answers (§65, §66): the change owed back, or the
 * amount still short. Exactly one is ever non-zero, so the caller cannot render the
 * wrong half of a negative difference — a "change" of -₹220 is a shortfall, and
 * saying so is the point of §66's "prevent completion when payment < outstanding".
 */
export type ChangeOwed = {
  readonly change: Money;
  readonly short: Money;
};

export function calculateChange(amountReceived: Money, billTotal: Money): ChangeOwed {
  assertSameCurrency(amountReceived, billTotal);
  const difference = amountReceived.minor - billTotal.minor;
  return {
    change: moneyFromPaise(difference > 0n ? difference : 0n, amountReceived.currency),
    short: moneyFromPaise(difference < 0n ? -difference : 0n, amountReceived.currency),
  };
}

/** Why a typed amount was refused — one line each, so a field can show it verbatim. */
export type MoneyInputReject = "BLANK" | "NOT_A_NUMBER" | "TOO_PRECISE" | "NEGATIVE";

export type MoneyInput =
  | { readonly ok: true; readonly amount: Money }
  | { readonly ok: false; readonly reason: MoneyInputReject };

/**
 * A typed amount, refused rather than thrown.
 *
 * `moneyFromRupees` throws, which is right at a door boundary where a bad string is a
 * bug; at a text field it is a person mid-typing, so this answers with a reason and no
 * exception. Deliberately strict about shape: grouped text ("1,234.56") is refused with
 * `NOT_A_NUMBER` instead of silently stripped, because accepting "1,2,3" on the way in
 * is how a money field ends up agreeing with itself about nothing.
 */
export function parseMoneyInput(
  value: string,
  currency: CurrencyCode = FALLBACK_CURRENCY,
): MoneyInput {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: false, reason: "BLANK" };
  if (trimmed.startsWith("-")) return { ok: false, reason: "NEGATIVE" };
  if (!/^\d*(?:\.\d*)?$/.test(trimmed) || trimmed === ".") {
    return { ok: false, reason: "NOT_A_NUMBER" };
  }
  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > specFor(currency).exponent) {
    return { ok: false, reason: "TOO_PRECISE" };
  }
  return { ok: true, amount: moneyFromRupees(trimmed, currency) };
}
