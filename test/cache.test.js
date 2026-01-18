import { describe, it, expect } from "vitest";
import { cache } from "../src/cache.js";

describe("cache()", () => {
  it("maps empty or null input to default strategy/storage", () => {
    expect(cache("")).toEqual({
      cache: { strategy: "cache-first", storage: "local", ttl: 60_000 },
    });

    expect(cache()).toEqual({
      cache: { strategy: "cache-first", storage: "local", ttl: 60_000 },
    });
  });

  it("wraps object input as { cache: input } without modification", () => {
    const input = { strategy: "cache-first", storage: "memory", ttl: 123 };
    expect(cache(input)).toEqual({ cache: input });
  });

  it("is case-insensitive for shorthand codes", () => {
    expect(cache("CFL 10s")).toEqual({
      cache: { strategy: "cache-first", storage: "local", ttl: 10_000 },
    });

    expect(cache("nFs 2m")).toEqual({
      cache: { strategy: "network-first", storage: "session", ttl: 120_000 },
    });
  });

  it("maps cache-first codes to correct strategy/storage", () => {
    expect(cache("cfl 1s")).toEqual({
      cache: { strategy: "cache-first", storage: "local", ttl: 1_000 },
    });

    expect(cache("cfs 1s")).toEqual({
      cache: { strategy: "cache-first", storage: "session", ttl: 1_000 },
    });

    expect(cache("cfm 1s")).toEqual({
      cache: { strategy: "cache-first", storage: "memory", ttl: 1_000 },
    });
  });

  it("maps network-first codes to correct strategy/storage", () => {
    expect(cache("nfl 1s")).toEqual({
      cache: { strategy: "network-first", storage: "local", ttl: 1_000 },
    });

    expect(cache("nfs 1s")).toEqual({
      cache: { strategy: "network-first", storage: "session", ttl: 1_000 },
    });

    expect(cache("nfm 1s")).toEqual({
      cache: { strategy: "network-first", storage: "memory", ttl: 1_000 },
    });
  });

  it("defaults to CFL rule when no code is present", () => {
    expect(cache("10s")).toEqual({
      cache: { strategy: "cache-first", storage: "local", ttl: 10_000 },
    });

    expect(cache("something else 5m")).toEqual({
      cache: { strategy: "cache-first", storage: "local", ttl: 300_000 },
    });
  });

  it("parses TTL seconds variants", () => {
    expect(cache("cfl 2s").cache.ttl).toBe(2_000);
    expect(cache("cfl 2sec").cache.ttl).toBe(2_000);
    expect(cache("cfl 2secs").cache.ttl).toBe(2_000);
    expect(cache("cfl 2second").cache.ttl).toBe(2_000);
    expect(cache("cfl 2seconds").cache.ttl).toBe(2_000);
  });

  it("parses TTL minutes variants", () => {
    expect(cache("cfl 2m").cache.ttl).toBe(120_000);
    expect(cache("cfl 2min").cache.ttl).toBe(120_000);
    expect(cache("cfl 2mins").cache.ttl).toBe(120_000);
    expect(cache("cfl 2minute").cache.ttl).toBe(120_000);
    expect(cache("cfl 2minutes").cache.ttl).toBe(120_000);
  });

  it("parses TTL hours variants", () => {
    expect(cache("cfl 2h").cache.ttl).toBe(7_200_000);
    expect(cache("cfl 2hr").cache.ttl).toBe(7_200_000);
    expect(cache("cfl 2hrs").cache.ttl).toBe(7_200_000);
    expect(cache("cfl 2hours").cache.ttl).toBe(7_200_000);
  });

  it("defaults TTL to 60_000 when no number is found", () => {
    const out = cache("cfl");
    expect(out.cache.ttl).toBe(60_000);
  });

  it("treats unknown TTL unit as milliseconds multiplier (unit fallback)", () => {
    // parseTTL: num * (map[unit] || 1)
    // "10xyz" => unit "xyz" not in map => multiplier 1 => 10ms
    expect(cache("cfl 10xyz").cache.ttl).toBe(10);
  });
});
