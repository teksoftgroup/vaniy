// resolveDateEpochDay.test.js
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDateEpochDay } from "../src/date.js";

const MS_DAY = 24 * 60 * 60 * 1000;

const optsNY = {
  dateFormat: "YYYY-MM-DD",
  timezone: "America/New_York",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveDateEpochDay (strict)", () => {
  it("returns null for blank inputs in value mode", () => {
    expect(resolveDateEpochDay("", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("   ", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay(null, {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay(undefined, {}, optsNY, "value")).toBeNull();
  });

  it("parses YYYY-MM-DD in value mode", () => {
    const ms = resolveDateEpochDay("2026-01-20", {}, optsNY, "value");
    expect(typeof ms).toBe("number");
    expect(Number.isFinite(ms)).toBe(true);
  });

  it("rejects non-matching dateFormat strings in value mode", () => {
    expect(resolveDateEpochDay("2026/01/20", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("01-20-2026", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("2026-1-20", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("2026-01-2", {}, optsNY, "value")).toBeNull();
  });

  it("rejects invalid ranges in YYYY-MM-DD parsing (month/day bounds + year)", () => {
    expect(resolveDateEpochDay("0000-01-01", {}, optsNY, "value")).toBeNull(); // !year
    expect(resolveDateEpochDay("2026-00-10", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("2026-13-10", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("2026-12-00", {}, optsNY, "value")).toBeNull();
    expect(resolveDateEpochDay("2026-12-32", {}, optsNY, "value")).toBeNull();
  });

  it("accepts ISO-like datetime strings in value mode (strict fallback)", () => {
    const ms1 = resolveDateEpochDay(
      "2026-01-20T15:30:00Z",
      {},
      optsNY,
      "value",
    );
    const ms2 = resolveDateEpochDay(
      "2026-01-20T15:30:00.123Z",
      {},
      optsNY,
      "value",
    );
    const ms3 = resolveDateEpochDay(
      "2026-01-20T15:30:00-05:00",
      {},
      optsNY,
      "value",
    );

    for (const ms of [ms1, ms2, ms3]) {
      expect(typeof ms).toBe("number");
      expect(Number.isFinite(ms)).toBe(true);
    }
  });

  it("accepts ISO-like datetime with a space separator (allowed by regex)", () => {
    const ms = resolveDateEpochDay("2026-01-20 15:30:00Z", {}, optsNY, "value");
    expect(typeof ms).toBe("number");
    expect(Number.isFinite(ms)).toBe(true);
  });

  it("rejects non-ISO-like date strings in value mode (no loose Date parsing)", () => {
    // These might parse in some JS engines via `new Date(...)`, but your code must reject them.
    expect(
      resolveDateEpochDay("Tue Jan 20 2026", {}, optsNY, "value"),
    ).toBeNull();
    expect(
      resolveDateEpochDay("2026-01-20 3pm", {}, optsNY, "value"),
    ).toBeNull();
    expect(resolveDateEpochDay("not-a-date", {}, optsNY, "value")).toBeNull();
  });

  it("rejects ISO-like strings that still produce Invalid Date", () => {
    // Matches regex shape but Date() should reject (hours out of range)
    expect(
      resolveDateEpochDay("2026-01-20T99:30:00Z", {}, optsNY, "value"),
    ).toBeNull();
  });

  it.skip("resolves literal YYYY-MM-DD targets in target mode", () => {
    const ms = resolveDateEpochDay("2026-01-20", {}, optsNY, "target");
    expect(typeof ms).toBe("number");
    expect(Number.isFinite(ms)).toBe(true);
  });

  it("resolves keyword targets today/tomorrow/yesterday (with frozen time)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z")); // 07:00 in NY (still Jan 20)

    const today = resolveDateEpochDay("today", {}, optsNY, "target");
    const tomorrow = resolveDateEpochDay("tomorrow", {}, optsNY, "target");
    const yesterday = resolveDateEpochDay("yesterday", {}, optsNY, "target");

    expect(tomorrow - today).toBe(MS_DAY);
    expect(today - yesterday).toBe(MS_DAY);
  });

  it("supports keyword offsets today+7 / today-30", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));

    const today = resolveDateEpochDay("today", {}, optsNY, "target");
    const plus7 = resolveDateEpochDay("today+7", {}, optsNY, "target");
    const minus30 = resolveDateEpochDay("today-30", {}, optsNY, "target");

    expect(plus7 - today).toBe(MS_DAY * 7);
    expect(today - minus30).toBe(MS_DAY * 30);
  });

  it("resolves field references in target mode (dateFormat in field value)", () => {
    const formData = { end_date: "2026-02-01" };
    const base = resolveDateEpochDay("end_date", formData, optsNY, "target");
    const plus7 = resolveDateEpochDay("end_date+7", formData, optsNY, "target");

    expect(plus7 - base).toBe(MS_DAY * 7);
  });

  it("resolves field references in target mode (ISO-like datetime in field value)", () => {
    const formData = { end_date: "2026-02-01T03:00:00Z" }; // ISO-like => allowed strict fallback
    const base = resolveDateEpochDay("end_date", formData, optsNY, "target");
    const plus7 = resolveDateEpochDay("end_date+7", formData, optsNY, "target");

    expect(plus7 - base).toBe(MS_DAY * 7);
  });

  it("returns null for missing/blank field refs in target mode", () => {
    expect(resolveDateEpochDay("end_date", {}, optsNY, "target")).toBeNull();
    expect(
      resolveDateEpochDay("end_date", { end_date: "" }, optsNY, "target"),
    ).toBeNull();
    expect(
      resolveDateEpochDay("end_date+7", { end_date: "   " }, optsNY, "target"),
    ).toBeNull();
  });

  it("returns null when target is unresolvable", () => {
    expect(resolveDateEpochDay("nonsense", {}, optsNY, "target")).toBeNull();
    expect(resolveDateEpochDay("nonsense+7", {}, optsNY, "target")).toBeNull();
    expect(resolveDateEpochDay("tomorow", {}, optsNY, "target")).toBeNull(); // typo
  });

  it.skip("handles DST transition days (NY) without shifting the epoch-day delta", () => {
    // US DST in 2026 starts Mar 8, 2026 in NY (spring forward)
    const d1 = resolveDateEpochDay("2026-03-07", {}, optsNY, "value");
    const d2 = resolveDateEpochDay("2026-03-08", {}, optsNY, "value");
    const d3 = resolveDateEpochDay("2026-03-09", {}, optsNY, "value");

    expect(d2 - d1).toBe(MS_DAY);
    expect(d3 - d2).toBe(MS_DAY);
  });
});
