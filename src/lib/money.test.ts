import { describe, expect, it } from "vitest";
import { AppError, toPublicError, type ErrorCode } from "./errors";
import {
  MAX_MONEY_MINOR_UNITS,
  MINOR_UNITS_PER_MAJOR,
  addMoney,
  calculateChange,
  currencySymbolFor,
  formatMoney,
  money,
  moneyFromDatabase,
  multiplyMoneyByQuantity,
  parseMoney,
  percentOfMoney,
  subtractMoney,
  toDecimalString,
  type Money,
} from "./money";

const INR = "INR";

function inr(minorUnits: number): Money {
  return { minorUnits, currency: INR };
}

/** Refusals are part of the API, so they are asserted as precisely as values. */
function expectAppError(action: () => unknown, code: ErrorCode): AppError {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AppError);
  const appError = thrown as AppError;
  expect(appError.code).toBe(code);
  return appError;
}

describe("the numeric(12,2) ceiling is a safe integer", () => {
  it("keeps the largest storable amount exact as a number", () => {
    expect(MAX_MONEY_MINOR_UNITS).toBe(999_999_999_999);
    expect(Number.isInteger(MAX_MONEY_MINOR_UNITS)).toBe(true);
    expect(Number.isSafeInteger(MAX_MONEY_MINOR_UNITS)).toBe(true);
    expect(MAX_MONEY_MINOR_UNITS).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    // BigInt is therefore not needed at this scale: 1e12 of headroom under 2^53.
    expect(Number.MAX_SAFE_INTEGER / MAX_MONEY_MINOR_UNITS).toBeGreaterThan(9000);
  });

  it("counts 100 paise in every rupee", () => {
    expect(MINOR_UNITS_PER_MAJOR).toBe(100);
  });
});

describe("parseMoney", () => {
  it("parses the shapes a cashier actually types", () => {
    expect(parseMoney("780", INR)).toEqual({ ok: true, value: inr(78_000) });
    expect(parseMoney("780.50", INR)).toEqual({ ok: true, value: inr(78_050) });
    expect(parseMoney("780.5", INR)).toEqual({ ok: true, value: inr(78_050) });
    expect(parseMoney("1,234.56", INR)).toEqual({ ok: true, value: inr(123_456) });
    expect(parseMoney("12,34,567.89", INR)).toEqual({ ok: true, value: inr(123_456_789) });
    expect(parseMoney("  780.50  ", INR)).toEqual({ ok: true, value: inr(78_050) });
    expect(parseMoney("0", INR)).toEqual({ ok: true, value: inr(0) });
    expect(parseMoney("0.05", INR)).toEqual({ ok: true, value: inr(5) });
    expect(parseMoney("0780", INR)).toEqual({ ok: true, value: inr(78_000) });
    expect(parseMoney("+780", INR)).toEqual({ ok: true, value: inr(78_000) });
    expect(parseMoney("780.", INR)).toEqual({ ok: true, value: inr(78_000) });
  });

  it("parses the top of the numeric(12,2) range exactly", () => {
    expect(parseMoney("9,999,999,999.99", INR)).toEqual({
      ok: true,
      value: inr(MAX_MONEY_MINOR_UNITS),
    });
  });

  it("refuses empty and non-decimal text with the copy a field would show", () => {
    expect(parseMoney("", INR)).toEqual({
      ok: false,
      reason: "EMPTY",
      error: "Enter an amount.",
    });
    for (const input of ["abc", "78O", "1e3", "7 80", "1,2", "12,34,", "..", "1.2.3", "-"]) {
      expect(parseMoney(input, INR), input).toMatchObject({ ok: false, reason: "NOT_A_DECIMAL" });
    }
  });

  it("refuses NaN, Infinity and three decimals rather than rounding them", () => {
    expect(parseMoney("NaN", INR)).toMatchObject({ ok: false, reason: "NOT_A_DECIMAL" });
    expect(parseMoney("Infinity", INR)).toMatchObject({ ok: false, reason: "NOT_A_DECIMAL" });
    expect(parseMoney("-Infinity", INR)).toMatchObject({ ok: false, reason: "NOT_A_DECIMAL" });
    expect(parseMoney("780.555", INR)).toMatchObject({
      ok: false,
      reason: "TOO_MANY_FRACTION_DIGITS",
      error: "An amount can have two decimal places at most.",
    });
  });

  it("refuses a float that arrived with binary dust instead of re-reading it", () => {
    // §1's actual bug: 0.1 + 0.2 as a number is 0.30000000000000004, and a paisa
    // count taken from that is wrong by a rounding decision nobody approved.
    const floatMoney = (0.1 + 0.2) as unknown as string;
    expect(parseMoney(floatMoney, INR)).toMatchObject({
      ok: false,
      reason: "TOO_MANY_FRACTION_DIGITS",
    });
  });

  it("refuses negatives and anything above the column's range", () => {
    expect(parseMoney("-780", INR)).toMatchObject({
      ok: false,
      reason: "NEGATIVE",
      error: "An amount cannot be negative here.",
    });
    expect(parseMoney("-0.01", INR)).toMatchObject({ ok: false, reason: "NEGATIVE" });
    expect(parseMoney("99,999,999,999.99", INR)).toMatchObject({
      ok: false,
      reason: "TOO_LARGE",
      error: "That amount is larger than this system can record.",
    });
    expect(parseMoney("100000000000.00", INR)).toMatchObject({ ok: false, reason: "TOO_LARGE" });
    // One paisa above the ceiling is refused; the ceiling itself parses above.
    expect(parseMoney("9999999999.99", INR)).toMatchObject({ ok: true });
    expect(parseMoney("9999999999.991", INR)).toMatchObject({
      ok: false,
      reason: "TOO_MANY_FRACTION_DIGITS",
    });
  });

  it("carries the currency it was given without assuming one", () => {
    expect(parseMoney("20.00", "USD")).toEqual({
      ok: true,
      value: { minorUnits: 2_000, currency: "USD" },
    });
  });
});

describe("moneyFromDatabase / toDecimalString round-trip", () => {
  it("reads the strings a numeric door hands back", () => {
    expect(moneyFromDatabase("780.50")).toBe(78_050);
    expect(moneyFromDatabase("780")).toBe(78_000);
    expect(moneyFromDatabase("780.5")).toBe(78_050);
    expect(moneyFromDatabase("0.00")).toBe(0);
    expect(moneyFromDatabase("0.05")).toBe(5);
    expect(moneyFromDatabase("-12.34")).toBe(-1_234);
    expect(moneyFromDatabase("9999999999.99")).toBe(MAX_MONEY_MINOR_UNITS);
  });

  it("writes decimal text a numeric column accepts, with no float in the path", () => {
    expect(toDecimalString(78_050)).toBe("780.50");
    expect(toDecimalString(0)).toBe("0.00");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(-1_234)).toBe("-12.34");
    expect(toDecimalString(MAX_MONEY_MINOR_UNITS)).toBe("9999999999.99");
    expect(toDecimalString(-MAX_MONEY_MINOR_UNITS)).toBe("-9999999999.99");
  });

  it("round-trips exactly across the whole range, including both boundaries", () => {
    const samples = [
      0,
      1,
      5,
      50,
      99,
      100,
      101,
      999,
      1_000,
      78_050,
      28_050,
      123_456_789,
      999_999_999_999,
      -1,
      -123_456,
      MAX_MONEY_MINOR_UNITS,
      -MAX_MONEY_MINOR_UNITS,
    ];
    for (const minorUnits of samples) {
      const text = toDecimalString(minorUnits);
      expect(moneyFromDatabase(text), text).toBe(minorUnits);
    }
    // And from the door's own text outward.
    for (const text of ["0.00", "1.00", "9999999999.99", "-0.99", "12345678.90"]) {
      expect(toDecimalString(moneyFromDatabase(text)), text).toBe(text);
    }
  });

  it("throws rather than inventing a paisa count from a malformed server value", () => {
    for (const value of ["", "abc", "NaN", "Infinity", "780.555", "1e3", "99999999999.99"]) {
      const error = expectAppError(() => moneyFromDatabase(value), "INTERNAL");
      expect(toPublicError(error).code).toBe("INTERNAL");
    }
    // The contract's own horror story: ₹280 arriving as a JSON float.
    expect(toPublicError(expectAppError(() => moneyFromDatabase("279.99999999999994"), "INTERNAL")))
      .toMatchObject({ code: "INTERNAL" });
  });

  it("refuses a non-integer or out-of-range paisa count in either direction", () => {
    expectAppError(() => toDecimalString(780.5), "INTERNAL");
    expectAppError(() => toDecimalString(Number.NaN), "INTERNAL");
    expectAppError(() => toDecimalString(Number.POSITIVE_INFINITY), "INTERNAL");
    expectAppError(() => toDecimalString(MAX_MONEY_MINOR_UNITS + 1), "VALIDATION_FAILED");
    expectAppError(() => money(MAX_MONEY_MINOR_UNITS + 1, INR), "VALIDATION_FAILED");
    expectAppError(() => money(0.5, INR), "INTERNAL");
    expect(money(78_050, INR)).toEqual(inr(78_050));
  });
});

describe("addMoney / subtractMoney", () => {
  it("adds in integers", () => {
    expect(addMoney(inr(78_050), inr(28_050))).toEqual(inr(106_100));
    expect(addMoney(inr(0), inr(5))).toEqual(inr(5));
    expect(addMoney(inr(-1_234), inr(1_234))).toEqual(inr(0));
    expect(addMoney(inr(MAX_MONEY_MINOR_UNITS - 1), inr(1))).toEqual(
      inr(MAX_MONEY_MINOR_UNITS),
    );
  });

  it("subtracts and may land on a credit balance", () => {
    expect(subtractMoney(inr(78_050), inr(28_050))).toEqual(inr(50_000));
    expect(subtractMoney(inr(0), inr(500))).toEqual(inr(-500));
  });

  it("fails loudly on a cross-currency call instead of converting quietly", () => {
    for (const action of [
      () => addMoney(inr(1_000), { minorUnits: 1_000, currency: "USD" }),
      () => subtractMoney(inr(1_000), { minorUnits: 1_000, currency: "USD" }),
    ]) {
      const error = expectAppError(action, "VALIDATION_FAILED");
      expect(error.message).toBe(
        "Those amounts are in different currencies and cannot be combined.",
      );
      expect(toPublicError(error).message).toBe(error.message);
    }
  });

  it("refuses a total the column cannot hold", () => {
    expectAppError(
      () => addMoney(inr(MAX_MONEY_MINOR_UNITS), inr(100)),
      "VALIDATION_FAILED",
    );
    expectAppError(
      () => subtractMoney(inr(-MAX_MONEY_MINOR_UNITS), inr(100)),
      "VALIDATION_FAILED",
    );
  });
});

describe("multiplyMoneyByQuantity", () => {
  it("is exact for the case a float version gets wrong", () => {
    // 2 x ₹280.50 must be ₹561.00, and in IEEE-754 2 * 280.5 is only luckily fine;
    // 3 * 0.1 is not. Integer paise removes the question.
    expect(multiplyMoneyByQuantity(inr(28_050), 2)).toEqual(inr(56_100));
    expect(multiplyMoneyByQuantity(inr(28_050), 3)).toEqual(inr(84_150));
    expect(toDecimalString(multiplyMoneyByQuantity(inr(28_050), 3).minorUnits)).toBe("841.50");
    expect(multiplyMoneyByQuantity(inr(1), 13)).toEqual(inr(13));
    expect(multiplyMoneyByQuantity(inr(12_345), 0)).toEqual(inr(0));
    expect(multiplyMoneyByQuantity(inr(-12_345), 2)).toEqual(inr(-24_690));
  });

  it("refuses a fractional, non-finite or overflowing quantity", () => {
    expectAppError(() => multiplyMoneyByQuantity(inr(28_050), 1.5), "VALIDATION_FAILED");
    expectAppError(() => multiplyMoneyByQuantity(inr(28_050), Number.NaN), "VALIDATION_FAILED");
    expectAppError(
      () => multiplyMoneyByQuantity(inr(28_050), Number.POSITIVE_INFINITY),
      "VALIDATION_FAILED",
    );
    // Too big for numeric(12,2), still exactly a whole number of paise.
    expectAppError(
      () => multiplyMoneyByQuantity(inr(MAX_MONEY_MINOR_UNITS), 10),
      "VALIDATION_FAILED",
    );
    // Beyond 2^53 the product is not even exact: an internal fault, not bad input.
    expectAppError(
      () => multiplyMoneyByQuantity(inr(MAX_MONEY_MINOR_UNITS), 20_000),
      "INTERNAL",
    );
  });
});

describe("percentOfMoney", () => {
  it("takes the ordinary discounts exactly", () => {
    expect(percentOfMoney(inr(28_050), 10)).toEqual(inr(2_805)); // ₹28.05 of ₹280.50
    expect(percentOfMoney(inr(78_000), 5)).toEqual(inr(3_900));
    expect(percentOfMoney(inr(1_000_000), 12.5)).toEqual(inr(125_000));
    expect(percentOfMoney(inr(28_050), 0)).toEqual(inr(0));
    expect(percentOfMoney(inr(28_050), 100)).toEqual(inr(28_050));
    expect(percentOfMoney(inr(MAX_MONEY_MINOR_UNITS), 100)).toEqual(
      inr(MAX_MONEY_MINOR_UNITS),
    );
  });

  it("pins the rounding rule: half-up at the paisa, ties away from zero", () => {
    // 1000 paise x 0.45% = 4.5 paise -> 5 (the tie rounds up, not to even).
    expect(percentOfMoney(inr(1_000), 0.45)).toEqual(inr(5));
    expect(percentOfMoney(inr(1_000), 0.35)).toEqual(inr(4)); // 3.5 -> 4
    expect(percentOfMoney(inr(1_000), 0.25)).toEqual(inr(3)); // 2.5 -> 3
    expect(percentOfMoney(inr(1_000), 0.34)).toEqual(inr(3)); // 3.4 -> 3
    expect(percentOfMoney(inr(1_000), 0.36)).toEqual(inr(4)); // 3.6 -> 4
    // Banker's rounding would give 4 and 2 here; half-up gives 5 and 3.
    expect(percentOfMoney(inr(99), 1)).toEqual(inr(1)); // 0.99 -> 1
    expect(percentOfMoney(inr(49), 1)).toEqual(inr(0)); // 0.49 -> 0
    // A signed amount keeps its sign and rounds away from zero.
    expect(percentOfMoney(inr(-1_000), 0.45)).toEqual(inr(-5));
  });

  it("refuses a percentage that is not a finite number in range", () => {
    expectAppError(() => percentOfMoney(inr(28_050), 101), "VALIDATION_FAILED");
    expectAppError(() => percentOfMoney(inr(28_050), -1), "VALIDATION_FAILED");
    expectAppError(() => percentOfMoney(inr(28_050), Number.NaN), "VALIDATION_FAILED");
    expectAppError(
      () => percentOfMoney(inr(28_050), Number.POSITIVE_INFINITY),
      "VALIDATION_FAILED",
    );
    expect(toPublicError(expectAppError(() => percentOfMoney(inr(1), 500), "VALIDATION_FAILED")))
      .toMatchObject({ code: "VALIDATION_FAILED" });
  });
});

describe("calculateChange", () => {
  it("gives the POS answer the walkthrough asks for", () => {
    // Received ₹1000 / Bill ₹780 / Change ₹220  (Prompt #04 §66)
    const change = calculateChange(inr(100_000), inr(78_000));
    expect(change).toEqual(inr(22_000));
    expect(formatMoney(change)).toBe("₹220.00");
  });

  it("handles a paisa total and an exact tender", () => {
    expect(calculateChange(inr(100_000), inr(78_050))).toEqual(inr(21_950));
    expect(calculateChange(inr(78_000), inr(78_000))).toEqual(inr(0));
  });

  it("refuses a short tender instead of returning negative change", () => {
    const error = expectAppError(
      () => calculateChange(inr(77_999), inr(78_000)),
      "VALIDATION_FAILED",
    );
    expect(error.message).toBe("The amount received is less than the bill total.");
    expect(error.details).toEqual({ shortByMinorUnits: 1 });
    expect(toPublicError(error).message).toBe(error.message);
    expectAppError(() => calculateChange(inr(-100), inr(78_000)), "VALIDATION_FAILED");
    expectAppError(
      () => calculateChange(inr(100_000), { minorUnits: 78_000, currency: "USD" }),
      "VALIDATION_FAILED",
    );
  });
});

describe("formatMoney", () => {
  it("groups in lakhs, not Western thousands", () => {
    expect(formatMoney(inr(12_345_678))).toBe("₹1,23,456.78");
    expect(formatMoney(inr(123_456))).toBe("₹1,234.56");
    expect(formatMoney(inr(1_234_567))).toBe("₹12,345.67");
    expect(formatMoney(inr(123_456_789))).toBe("₹12,34,567.89");
    expect(formatMoney(inr(MAX_MONEY_MINOR_UNITS))).toBe("₹9,99,99,99,999.99");
    expect(formatMoney(inr(12_345_678))).not.toBe("₹123,456.78");
  });

  it("always shows two fraction digits and the paisa exactly", () => {
    expect(formatMoney(inr(0))).toBe("₹0.00");
    expect(formatMoney(inr(5))).toBe("₹0.05");
    expect(formatMoney(inr(50))).toBe("₹0.50");
    expect(formatMoney(inr(78_000))).toBe("₹780.00");
    expect(formatMoney(inr(-1_234))).toBe("-₹12.34");
  });

  it("has a symbol per known currency and a code fallback for an unknown one", () => {
    expect(currencySymbolFor("INR")).toBe("₹");
    expect(currencySymbolFor("USD")).toBe("$");
    expect(currencySymbolFor("EUR")).toBe("€");
    expect(currencySymbolFor("AED")).toBe("AED ");
    expect(currencySymbolFor("inr")).toBe("₹");
    expect(formatMoney({ minorUnits: 100_050, currency: "USD" })).toBe("$1,000.50");
    expect(formatMoney({ minorUnits: 100_050, currency: "EUR" })).toBe("€1,000.50");
    expect(formatMoney({ minorUnits: 100_050, currency: "AED" })).toBe("AED 1,000.50");
    // No crash, no emoji guesswork: an unmapped code renders the code.
    expect(formatMoney({ minorUnits: 100_050, currency: "MYR" })).toBe("MYR 1,000.50");
  });

  it("honours a non-Indian locale, grouping and separator both", () => {
    expect(formatMoney(inr(12_345_678), { locale: "en-US" })).toBe("₹123,456.78");
    expect(
      formatMoney({ minorUnits: 1_234_567, currency: "EUR" }, { locale: "de-DE" }),
    ).toBe("€12.345,67");
  });

  it("refuses a paisa count it cannot render exactly", () => {
    expectAppError(() => formatMoney(inr(12_345.5)), "INTERNAL");
    expectAppError(() => formatMoney(inr(MAX_MONEY_MINOR_UNITS + 1)), "VALIDATION_FAILED");
  });
});
