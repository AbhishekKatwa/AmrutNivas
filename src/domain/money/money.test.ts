import { describe, expect, it } from "vitest";
import {
  addMoney,
  assertNoFloatMoney,
  formatMoney,
  moneyFromPaise,
  moneyFromRupees,
  splitMoney,
  subMoney,
} from "./money";

describe("moneyFromRupees — string parsing, never float arithmetic", () => {
  it("parses exact paise from decimal text", () => {
    expect(moneyFromRupees("123.45").minor).toBe(12345n);
    expect(moneyFromRupees("0.10").minor).toBe(10n);
    expect(moneyFromRupees("0.20").minor).toBe(20n);
    expect(moneyFromRupees("1").minor).toBe(100n);
    expect(moneyFromRupees(".5").minor).toBe(50n);
    expect(moneyFromRupees("-42.07").minor).toBe(-4207n);
  });

  it("is exact where IEEE-754 addition is not (0.1 + 0.2)", () => {
    // In floats: 0.1 + 0.2 === 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);
    const tenth = moneyFromRupees("0.1");
    const fifth = moneyFromRupees("0.2");
    const exact = moneyFromRupees("0.3");
    expect(addMoney(tenth, fifth).minor).toBe(exact.minor);
  });

  it("adds and subtracts without drift over many lines", () => {
    let running = moneyFromPaise(0n);
    for (let i = 0; i < 1000; i += 1) {
      running = addMoney(running, moneyFromRupees("0.01"));
    }
    // 1000 x 1 paisa is exactly 1000 paise, not 999.999999999 something.
    expect(running.minor).toBe(1000n);
    expect(subMoney(running, moneyFromRupees("10.00")).minor).toBe(0n);
  });

  it("rejects sub-paise precision instead of silently rounding", () => {
    expect(() => moneyFromRupees("1.005")).toThrow(/fraction digits/);
    expect(() => moneyFromRupees("abc")).toThrow(/Invalid amount/);
    expect(() => moneyFromRupees("")).toThrow(/Invalid amount/);
  });

  it("honours a zero-decimal currency", () => {
    expect(moneyFromRupees("1000", "JPY").minor).toBe(1000n);
    expect(() => moneyFromRupees("1000.5", "JPY")).toThrow(/fraction digits/);
  });
});

describe("splitMoney — remainder distribution with no drift", () => {
  it("sums exactly to the total when the division is not even", () => {
    const shares = splitMoney(100n, 3);
    expect(shares).toEqual([34n, 33n, 33n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(100n);
  });

  it("is deterministic and exact across realistic bill splits", () => {
    for (const total of [1n, 999n, 1000000n, 50050n, 7n]) {
      for (const parts of [1, 2, 3, 4, 5, 7, 11]) {
        const shares = splitMoney(total, parts);
        expect(shares).toHaveLength(parts);
        expect(shares.reduce((a, b) => a + b, 0n)).toBe(total);
        expect(shares).toEqual(splitMoney(total, parts));
        // Shares never differ by more than one minor unit.
        const max = shares.reduce((a, b) => (b > a ? b : a));
        const min = shares.reduce((a, b) => (b < a ? b : a));
        expect(max - min).toBeLessThanOrEqual(1n);
      }
    }
  });

  it("handles negative totals (refunds) without losing a paisa", () => {
    const shares = splitMoney(-100n, 3);
    expect(shares).toEqual([-34n, -33n, -33n]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(-100n);
  });

  it("refuses a nonsensical part count", () => {
    expect(() => splitMoney(100n, 0)).toThrow(/Cannot split/);
    expect(() => splitMoney(100n, 2.5)).toThrow(/Cannot split/);
  });
});

describe("formatMoney", () => {
  it("renders Indian digit grouping at the default locale", () => {
    expect(formatMoney(1234567890n)).toBe("₹1,23,45,678.90");
    expect(formatMoney(moneyFromRupees("12345678.90"))).toBe("₹1,23,45,678.90");
  });

  it("renders small and zero amounts with two fraction digits", () => {
    expect(formatMoney(0n)).toBe("₹0.00");
    expect(formatMoney(5n)).toBe("₹0.05");
    expect(formatMoney(100n)).toBe("₹1.00");
  });

  it("renders a negative amount without a double sign", () => {
    expect(formatMoney(-12345n)).toBe("-₹123.45");
  });

  it("is not India-locked: currency and locale are parameters", () => {
    expect(formatMoney(1234567890n, { currency: "USD", locale: "en-US" })).toBe(
      "$12,345,678.90",
    );
    expect(formatMoney(1234567n, { currency: "EUR", locale: "de-DE" })).toBe("€12.345,67");
    expect(formatMoney(1000n, { currency: "XXX", locale: "en-US" })).toBe("XXX10.00");
  });

  it("formats a zero-decimal currency without a fraction", () => {
    expect(formatMoney(1234n, { currency: "JPY", locale: "ja-JP" })).toBe("¥1,234");
  });
});

describe("assertNoFloatMoney", () => {
  it("accepts integer minor units and bigint", () => {
    expect(assertNoFloatMoney(12345, "ledger")).toBe(12345n);
    expect(assertNoFloatMoney(12345n, "ledger")).toBe(12345n);
  });

  it("rejects a float where minor units are required", () => {
    expect(() => assertNoFloatMoney(123.45, "ledger")).toThrow(/float 123.45/);
    expect(() => assertNoFloatMoney("12345", "ledger")).toThrow(/expected minor units/);
  });
});
