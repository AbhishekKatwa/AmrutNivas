/**
 * Money: integer minor units, never a float.
 *
 * THE RULE (`docs/RESTAURANT_BUILD_CONTRACT.md` §1): a rupee amount is an integer
 * count of paise plus a currency code. `0.1 + 0.2 !== 0.3` in IEEE-754, and a door
 * that returns `numeric` as a JSON number turns ₹280 into `279.99999999999994` on
 * a bill. So: parse decimal *text* into integers, add and multiply in integers,
 * round only inside `percentOfMoney`, format only in `formatMoney`. No screen does
 * arithmetic on a parsed float.
 *
 * WHY A RESULT FOR PARSING AND A THROW FOR OPERATIONS: `parseMoney` takes what a
 * person typed, and "780.999" is an expected failure the caller must branch on and
 * show as a field error — screens in this repo already collect such strings into a
 * `Record<string, string>` of field errors. A cross-currency `addMoney`, by
 * contrast, is not user input: it is a caller bug, and a caller bug must not be
 * silently swallowed by an `ok` flag nobody checked. Those throw `AppError` with
 * `VALIDATION_FAILED` / `INTERNAL`, the same shape `src/lib/errors.ts` was built to
 * filter, so `toPublicError` can turn one into safe copy.
 *
 * A currency code is not re-validated here: the door CHECK constraints and
 * `src/db/door-errors.ts` already own that vocabulary, and a second authority is
 * how the two drift apart.
 */

import { AppError, ERROR_CODES } from "./errors";

/** An amount of money: whole paise plus the ISO code they are counted in. */
export type Money = {
  readonly minorUnits: number;
  readonly currency: string;
};

/** Paise per rupee. Every amount in this module uses a 2-decimal currency. */
export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * The largest value a `numeric(12,2)` can hold — 9,999,999,999.99 — expressed in
 * paise. It is 999,999,999,999, which is `1e12 - 1` and comfortably inside
 * `Number.MAX_SAFE_INTEGER` (`9,007,199,254,740,991`), so a `number` is exact at
 * this scale and BigInt is not needed.
 */
export const MAX_MONEY_MINOR_UNITS = 999_999_999_999;

/** Above this many digits, a decimal string cannot be trusted to survive `Number`. */
const MAX_SIGNIFICANT_DIGITS = 15;

export type MoneyParseReason =
  | "EMPTY"
  | "NOT_A_DECIMAL"
  | "TOO_MANY_FRACTION_DIGITS"
  | "NEGATIVE"
  | "TOO_LARGE";

/**
 * Copy written for the person at the keyboard, never the mechanism. The raw text
 * is not echoed back into it: user input reaching a toast is an information leak
 * and `toPublicError` would strip it anyway.
 */
const PARSE_COPY: Record<MoneyParseReason, string> = {
  EMPTY: "Enter an amount.",
  NOT_A_DECIMAL: "Enter an amount using digits, like 780 or 780.50.",
  TOO_MANY_FRACTION_DIGITS: "An amount can have two decimal places at most.",
  NEGATIVE: "An amount cannot be negative here.",
  TOO_LARGE: "That amount is larger than this system can record.",
};

export type ParseMoneyResult =
  | { readonly ok: true; readonly value: Money }
  | { readonly ok: false; readonly reason: MoneyParseReason; readonly error: string };

/** Display prefixes. A value may carry its own spacing; an unknown code renders as code + space. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  AED: "AED ",
};

/**
 * Text → paise, exactly, with no float anywhere in the path: the digits are taken
 * as strings and only the final whole-paisa integer becomes a `number`.
 *
 * Accepts an optional sign, optional grouping commas in either the Western
 * (`1,234,567`) or lakh (`12,34,567`) shape, and one to two fraction digits.
 * Rejects `NaN`, `Infinity`, exponent notation, spaces inside the number, three
 * decimals, and anything above `numeric(12,2)`.
 */
function minorUnitsFromText(
  text: string,
): { readonly negative: boolean; readonly minorUnits: number } | MoneyParseReason {
  const trimmed = text.trim();
  if (trimmed === "") return "EMPTY";

  const signMatch = /^([+-]?)(.*)$/.exec(trimmed);
  const sign = signMatch?.[1] ?? "";
  const body = signMatch?.[2] ?? "";

  const parts = body.split(".");
  if (parts.length > 2) return "NOT_A_DECIMAL";
  const [integerText = "", fractionText = ""] = parts;

  if (fractionText.length > 2) return "TOO_MANY_FRACTION_DIGITS";
  // A grouping comma must separate runs of 2 or 3 digits — the lakh (`12,34,567`)
  // and Western (`1,234,567`) shapes — and may never lead, trail or double up.
  if (!/^\d+(?:,\d{2,3})*$/.test(integerText)) return "NOT_A_DECIMAL";
  if (fractionText !== "" && !/^\d+$/.test(fractionText)) return "NOT_A_DECIMAL";

  const digits = integerText.replace(/,/g, "") + fractionText.padEnd(2, "0");
  if (digits.length > MAX_SIGNIFICANT_DIGITS) return "TOO_LARGE";

  const minorUnits = Number(digits);
  // `Number.isSafeInteger` is the exactness proof: below 2^53 every integer round-
  // trips, so a value that fails it was never representable in the first place.
  if (!Number.isFinite(minorUnits) || !Number.isSafeInteger(minorUnits)) return "TOO_LARGE";
  if (minorUnits > MAX_MONEY_MINOR_UNITS) return "TOO_LARGE";

  return { negative: sign === "-", minorUnits };
}

/**
 * Parse a typed amount into minor units. Money at this boundary is non-negative:
 * a negative balance is a *result* of arithmetic (a refund, a credit), never a
 * number someone types into a payment box.
 */
export function parseMoney(input: string, currency: string): ParseMoneyResult {
  // Defensive read of a boundary a type annotation cannot fully hold: a caller that
  // hands us a `number` has already broken §1. Its decimal expansion is what gets
  // read, so a value carrying binary dust (`0.1 + 0.2` prints as
  // `0.30000000000000004`) is refused for having too many fraction digits instead
  // of being quietly rounded into a paisa count.
  const raw: unknown = input;
  const text = typeof raw === "string" ? raw : String(raw);
  const parsed = minorUnitsFromText(text);
  if (typeof parsed === "string") return fail(parsed);
  if (parsed.negative) return fail("NEGATIVE");
  return { ok: true, value: { minorUnits: parsed.minorUnits, currency } };
}

function fail(reason: MoneyParseReason): ParseMoneyResult {
  return { ok: false, reason, error: PARSE_COPY[reason] };
}

/**
 * The string a Postgres `numeric` arrives as (`"780.50"`, `"780"`, `"-12.34"`) →
 * paise. Server-supplied data, so a malformed value is a build fault and throws
 * rather than offering the user a branch to ignore.
 */
export function moneyFromDatabase(value: string): number {
  const parsed = minorUnitsFromText(value);
  if (typeof parsed === "string") {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      "An amount did not arrive as a decimal number.",
      { details: { reason: parsed } },
    );
  }
  return parsed.negative ? -parsed.minorUnits : parsed.minorUnits;
}

/** Paise → the exact decimal text `numeric(12,2)` expects. No grouping, always 2 fractions. */
export function toDecimalString(minorUnits: number): string {
  const absolute = assertStorable(minorUnits, "toDecimalString");
  const whole = Math.floor(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = (absolute % MINOR_UNITS_PER_MAJOR).toString().padStart(2, "0");
  return `${minorUnits < 0 ? "-" : ""}${whole}.${fraction}`;
}

/** Build a validated `Money` from an integer paisa count. */
export function money(minorUnits: number, currency: string): Money {
  assertStorable(minorUnits, "money");
  return { minorUnits, currency };
}

/**
 * The single guard every operation passes through: whole, exactly representable,
 * and inside the column's range. A computed total nobody can store is a bug worth
 * throwing over.
 */
function assertStorable(minorUnits: number, context: string): number {
  if (!Number.isInteger(minorUnits) || !Number.isSafeInteger(minorUnits)) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      "A money calculation produced a value that is not a whole number of paise.",
      { details: { context } },
    );
  }
  if (Math.abs(minorUnits) > MAX_MONEY_MINOR_UNITS) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "That total is larger than this system can record.",
      { details: { context } },
    );
  }
  return Math.abs(minorUnits);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    // Loud, never lossy: there is no rate here and a silent conversion would be
    // the most expensive kind of wrong total.
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "Those amounts are in different currencies and cannot be combined.",
      { details: { leftCurrency: a.currency, rightCurrency: b.currency } },
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

/**
 * `a - b`. May go negative — a credit note or an over-applied payment is a real
 * balance, and forbidding it would push callers into ad-hoc sign hacks.
 */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

/**
 * Line total: `quantity × unit price`, both integers, so `2 × ₹280.50` is exactly
 * `₹561.00` and never `560.9999999999999`. A fractional quantity belongs to the
 * server's calculation engine (§2), not to a UI.
 */
export function multiplyMoneyByQuantity(amount: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || !Number.isSafeInteger(quantity)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "A quantity must be a whole number.",
      { details: { quantity } },
    );
  }
  // Two integers whose product is a safe integer multiply exactly; a product that
  // is only *nearly* representable is refused by the guard rather than rounded into
  // a plausible-looking line total.
  return money(amount.minorUnits * quantity, amount.currency);
}

/**
 * `percent` of `amount`, for a discount or a service charge.
 *
 * ROUNDING RULE: half-up at the paisa boundary — the exact product is divided and
 * a tie of exactly half a paisa rounds away from zero. Percent is quantised to
 * whole hundredths of a percent (12.5 → 1250 basis points) before multiplying, so
 * no float ever touches the amount itself.
 *
 * The multiply/divide is split so no intermediate exceeds `1e12`: `(whole / 1e4)`
 * is multiplied first and only the remainder carries the tie adjustment.
 */
export function percentOfMoney(amount: Money, percent: number): Money {
  if (!Number.isFinite(percent)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "A percentage must be a finite number.",
      { details: { percent } },
    );
  }
  if (percent < 0 || percent > 100) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "A percentage must be between 0 and 100.",
      { details: { percent } },
    );
  }
  const basisPoints = Math.round(percent * 100); // integer, 0..10_000
  const absolute = assertStorable(amount.minorUnits, "percentOfMoney");

  const bigChunk = Math.floor(absolute / 10_000);
  const remainder = absolute - bigChunk * 10_000;
  const exactPart = bigChunk * basisPoints;
  const roundedPart = Math.floor(
    (remainder * basisPoints + 5_000) / 10_000, // +half a paisa, then truncate
  );
  const result = exactPart + roundedPart;
  return money(amount.minorUnits < 0 ? -result : result, amount.currency);
}

/**
 * What the till hands back. Refuses a short payment instead of returning a
 * negative "change" a cashier would then have to notice (§1 of the contract:
 * silence is not a control).
 */
export function calculateChange(amountReceived: Money, billTotal: Money): Money {
  assertSameCurrency(amountReceived, billTotal);
  if (amountReceived.minorUnits < 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "The amount received cannot be negative.",
    );
  }
  const change = amountReceived.minorUnits - billTotal.minorUnits;
  if (change < 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      "The amount received is less than the bill total.",
      { details: { shortByMinorUnits: -change } },
    );
  }
  return money(change, amountReceived.currency);
}

/** `INR → ₹`, `AED → AED `, an unknown code renders as the code instead of crashing. */
export function currencySymbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
}

/** Which decimal separator this locale writes ("." or ","), probed once per call. */
function decimalSeparatorFor(locale: string): string {
  const parts = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(1.01);
  return parts.find((part) => part.type === "decimal")?.value ?? ".";
}

/**
 * Display, the one place a money value is allowed to become text for a human.
 * Grouping comes from `Intl` with `en-IN` (lakh/crore: `₹1,23,456.78`, not
 * `123,456.78`); the integer part is formatted as a whole number of rupees and the
 * paisa are appended from the exact remainder, so no float is ever reconstructed.
 */
export function formatMoney(amount: Money, options: { locale?: string } = {}): string {
  const locale = options.locale ?? "en-IN";
  const absolute = assertStorable(amount.minorUnits, "formatMoney");
  const whole = Math.floor(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = (absolute % MINOR_UNITS_PER_MAJOR).toString().padStart(2, "0");
  const grouped = new Intl.NumberFormat(locale, { useGrouping: true, maximumFractionDigits: 0 }).format(whole);
  return `${amount.minorUnits < 0 ? "-" : ""}${currencySymbolFor(amount.currency)}${grouped}${decimalSeparatorFor(locale)}${fraction}`;
}
