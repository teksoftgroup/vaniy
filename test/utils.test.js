import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  redirect,
  isArray,
  isArrayEmpty,
  isFocus,
  toCurrency,
  formatByCountry,
  isValidRoutingNumber,
} from "../src/utils.js";

describe("utils.js", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="a" />
      <input id="b" />
    `;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("redirect()", () => {
    it("sets window.location.href to the given url", () => {
      const setHref = vi.fn();

      // In jsdom, window.location is not always easily writable.
      // Mock just the href setter via defineProperty.
      Object.defineProperty(window, "location", {
        value: {
          get href() {
            return "";
          },
          set href(v) {
            setHref(v);
          },
        },
        writable: true,
      });

      redirect("https://example.com/next");

      expect(setHref).toHaveBeenCalledWith("https://example.com/next");
    });
  });

  describe("isArray() / isArrayEmpty()", () => {
    it("isArray returns true only for arrays", () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2])).toBe(true);

      expect(isArray({})).toBe(false);
      expect(isArray("x")).toBe(false);
      expect(isArray(null)).toBe(false);
      expect(isArray(undefined)).toBe(false);
    });

    it("isArrayEmpty returns true for non-arrays and empty arrays; false for arrays with length", () => {
      expect(isArrayEmpty([])).toBe(true);
      expect(isArrayEmpty([1])).toBe(false);
      expect(isArrayEmpty([0, 0])).toBe(false);

      expect(isArrayEmpty(null)).toBe(true);
      expect(isArrayEmpty(undefined)).toBe(true);
      expect(isArrayEmpty("nope")).toBe(true);
      expect(isArrayEmpty({ length: 1 })).toBe(true); // not an array
    });
  });

  describe("isFocus()", () => {
    it("returns true when element is document.activeElement", () => {
      const a = document.getElementById("a");
      const b = document.getElementById("b");

      a.focus();
      expect(isFocus(a)).toBe(true);
      expect(isFocus(b)).toBe(false);
    });

    it("returns false for null/undefined elements", () => {
      expect(isFocus(null)).toBe(false);
      expect(isFocus(undefined)).toBe(false);
    });
  });

  describe("toCurrency()", () => {
    it("formats number as currency using default config (en-US, USD)", () => {
      const s = toCurrency(1234.56);
      // Typically "$1,234.56" in en-US. Allow minor env differences.
      expect(s).toContain("1,234.56");
      expect(s).toMatch(/\$/);
    });

    it("formats with provided locale/currency", () => {
      const s = toCurrency(10, { locale: "en-GB", currency: "GBP" });
      // Typically "£10.00"
      expect(s).toMatch(/£/);
      expect(s).toContain("10");
    });
  });

  describe("formatByCountry()", () => {
    it("uses country mapping when known", () => {
      const s = formatByCountry(12.34, "GB");
      expect(s).toMatch(/£/);
    });

    it("falls back to US config when unknown", () => {
      const s = formatByCountry(12.34, "ZZ");
      expect(s).toMatch(/\$/);
    });
  });

  describe("isValidRoutingNumber()", () => {
    it("returns false for non-9-digit strings", () => {
      expect(isValidRoutingNumber("")).toBe(false);
      expect(isValidRoutingNumber("123")).toBe(false);
      expect(isValidRoutingNumber("12345678")).toBe(false);
      expect(isValidRoutingNumber("1234567890")).toBe(false);
      expect(isValidRoutingNumber("abcdefghi")).toBe(false);
      expect(isValidRoutingNumber("12345678a")).toBe(false);
    });

    it("returns true for a checksum-valid routing number and false when a digit changes", () => {
      // weights for ABA routing checksum
      const weights = [7, 3, 1, 7, 3, 1, 7, 3, 1];

      const makeValidRouting = (first8) => {
        if (!/^\d{8}$/.test(first8)) throw new Error("first8 must be 8 digits");

        const digits = first8.split("").map(Number);

        const sum8 = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
        const checkDigit = (10 - (sum8 % 10)) % 10;

        return first8 + String(checkDigit);
      };

      const rn = makeValidRouting("12345678");
      expect(isValidRoutingNumber(rn)).toBe(true);

      // change the last digit => should fail checksum
      const badLastDigit = rn.slice(0, 8) + String((Number(rn[8]) + 1) % 10);
      expect(isValidRoutingNumber(badLastDigit)).toBe(false);

      // change a middle digit => should also fail checksum (usually)
      const badMiddleDigit =
        rn.slice(0, 3) + String((Number(rn[3]) + 1) % 10) + rn.slice(4);
      expect(isValidRoutingNumber(badMiddleDigit)).toBe(false);
    });
  });
});
