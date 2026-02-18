import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  redirect,
  isArray,
  isArrayEmpty,
  isFocus,
  toCurrency,
  formatByCountry,
  isValidRoutingNumber,
  isBlank,
  parseMinMax,
  autoSize,
  fromCamelToKebabCase,
  observe,
  deepClone,
  curry,
  chainAsync,
  sequenceAsync,
  tryCatch,
  flow,
  sleep,
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

  describe("isBlank()", () => {
    it("returns true for null, undefined, empty, and whitespace-only strings", () => {
      expect(isBlank(null)).toBe(true);
      expect(isBlank(undefined)).toBe(true);
      expect(isBlank("")).toBe(true);
      expect(isBlank("   ")).toBe(true);
    });

    it("returns false for non-empty values", () => {
      expect(isBlank("a")).toBe(false);
      expect(isBlank("hello")).toBe(false);
      expect(isBlank(0)).toBe(false);
      expect(isBlank(false)).toBe(false);
    });
  });

  describe("parseMinMax()", () => {
    it("parses valid 'min,max' string into {min, max}", () => {
      expect(parseMinMax("2,10")).toEqual({ min: 2, max: 10 });
      expect(parseMinMax("0,100")).toEqual({ min: 0, max: 100 });
      expect(parseMinMax(" 5 , 20 ")).toEqual({ min: 5, max: 20 });
    });

    it("returns null for invalid or missing input", () => {
      expect(parseMinMax("abc,xyz")).toBeNull();
      expect(parseMinMax(null)).toBeNull();
      expect(parseMinMax("5")).toBeNull(); // max is NaN
      expect(parseMinMax("")).toBeNull();
    });
  });

  describe("autoSize()", () => {
    it("returns array length for arrays", () => {
      expect(autoSize([1, 2, 3])).toBe(3);
      expect(autoSize([])).toBe(0);
    });

    it("returns numeric value for finite numbers", () => {
      expect(autoSize(42)).toBe(42);
      expect(autoSize(0)).toBe(0);
    });

    it("returns numeric value for numeric strings", () => {
      expect(autoSize("7")).toBe(7);
      expect(autoSize("-3.5")).toBe(-3.5);
    });

    it("returns string length for non-numeric strings", () => {
      expect(autoSize("hello")).toBe(5);
      expect(autoSize("")).toBe(0);
    });

    it("returns string length of coerced value for null/undefined", () => {
      expect(autoSize(null)).toBe(0);
      expect(autoSize(undefined)).toBe(0);
    });
  });

  describe("fromCamelToKebabCase()", () => {
    it("converts camelCase to kebab-case", () => {
      expect(fromCamelToKebabCase("camelCase")).toBe("camel-case");
      expect(fromCamelToKebabCase("myVariableName")).toBe("my-variable-name");
      expect(fromCamelToKebabCase("alreadylower")).toBe("alreadylower");
    });
  });

  describe("observe()", () => {
    it("calls onChange when a property is set on the observed object", () => {
      const obj = { count: 0 };
      const onChange = vi.fn();
      const proxy = observe(obj, onChange);

      proxy.count = 5;

      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith({ key: "count", value: 5 });
      expect(obj.count).toBe(5);
    });
  });

  describe("deepClone()", () => {
    it("returns a deep copy that does not share references", () => {
      const original = { a: 1, nested: { b: 2 } };
      const clone = deepClone(original);

      expect(clone).toEqual(original);
      clone.nested.b = 99;
      expect(original.nested.b).toBe(2); // original unchanged
    });
  });

  describe("curry()", () => {
    it("returns a curried function that accepts args one at a time", () => {
      const add = curry((a, b) => a + b);
      expect(add(1)(2)).toBe(3);
    });

    it("also works when all args are supplied at once", () => {
      const multiply = curry((a, b, c) => a * b * c);
      expect(multiply(2, 3, 4)).toBe(24);
    });
  });

  describe("chainAsync() / sequenceAsync()", () => {
    it("chainAsync chains a value through a promise then-handler", async () => {
      const result = await chainAsync(Promise.resolve(5), (x) => x + 1);
      expect(result).toBe(6);
    });

    it("sequenceAsync pipes an initial value through a series of async functions", async () => {
      const result = await sequenceAsync(
        (x) => x + 1,
        (x) => x * 2,
      )(5);
      // (5+1)*2 = 12
      expect(result).toBe(12);
    });
  });

  describe("tryCatch()", () => {
    it("returns [null, data] on success", async () => {
      const [err, data] = await tryCatch(Promise.resolve(42));
      expect(err).toBeNull();
      expect(data).toBe(42);
    });

    it("returns [err, null] on rejection", async () => {
      const error = new Error("boom");
      const [err, data] = await tryCatch(Promise.reject(error));
      expect(err).toBe(error);
      expect(data).toBeNull();
    });
  });

  describe("flow()", () => {
    it("pipes initial value through all functions and returns [null, result]", async () => {
      const [err, result] = await flow(
        10,
        (x) => Promise.resolve(x * 2),
        (x) => Promise.resolve(x + 5),
      );
      expect(err).toBeNull();
      expect(result).toBe(25); // 10*2=20, 20+5=25
    });

    it("stops and returns [err, null] when a step rejects", async () => {
      const boom = new Error("step failed");
      const [err, result] = await flow(
        1,
        () => Promise.reject(boom),
        () => Promise.resolve(999),
      );
      expect(err).toBe(boom);
      expect(result).toBeNull();
    });

    it("passes a non-function step value directly through tryCatch", async () => {
      // A non-function step: `typeof fn !== "function"` → tryCatch(fn) where fn is a resolved Promise
      const [err, result] = await flow(
        "ignored",
        Promise.resolve("constant"),
      );
      expect(err).toBeNull();
      expect(result).toBe("constant");
    });
  });

  describe("sleep()", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves after the given number of milliseconds", async () => {
      let resolved = false;
      const p = sleep(500).then(() => {
        resolved = true;
      });

      expect(resolved).toBe(false);
      vi.advanceTimersByTime(500);
      await p;
      expect(resolved).toBe(true);
    });
  });
});
