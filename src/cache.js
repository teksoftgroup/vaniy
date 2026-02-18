"use strict";

export function cache(input) {
  if (input == null) {
    return {
      cache: { strategy: "cache-first", storage: "local", ttl: 60_000 },
    };
  }

  if (typeof input === "object") return { cache: input }; // Already an object? Use it.

  const str = input.toLowerCase();

  // Map shorthand to strategy + storage
  const map = {
    cfl: { strategy: "cache-first", storage: "local" },
    cfs: { strategy: "cache-first", storage: "session" },
    cfm: { strategy: "cache-first", storage: "memory" },

    nfl: { strategy: "network-first", storage: "local" },
    nfs: { strategy: "network-first", storage: "session" },
    nfm: { strategy: "network-first", storage: "memory" },
  };

  // Extract rule (CFL, NFS, etc.)
  const code = str.match(/cfl|cfs|cfm|nfl|nfs|nfm/);
  const rule = code ? map[code[0]] : map["cfl"]; // default CFL if not specified

  // Extract TTL
  const ttlMatch = str.match(
    /(\d+)\s*(s|sec|secs|second|seconds|min|m|mins|minute|minutes|h|hr|hours)?/,
  );
  const ttl = ttlMatch ? parseTTL(ttlMatch[0]) : 60_000;

  return {
    cache: {
      strategy: rule.strategy,
      storage: rule.storage,
      ttl,
    },
  };
}

function parseTTL(str) {
  const unit = str.replace(/[0-9]/g, "").trim().toLowerCase();
  const num = parseInt(str, 10);

  const map = {
    s: 1_000,
    sec: 1_000,
    secs: 1_000,
    second: 1_000,
    seconds: 1_000,
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    hours: 3_600_000,
  };

  return num * (map[unit] || 1);
}
