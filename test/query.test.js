import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import EVT from "../src/evt.js";

// Mock browser APIs
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => (store[key] = val)),
    removeItem: vi.fn((key) => delete store[key]),
    clear: vi.fn(() => (store = {})),
  };
})();

vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {
  addEventListener: vi.fn(),
  location: { href: "" },
});
vi.stubGlobal("document", { querySelector: vi.fn() });

// Import after globals are set up
const { createQuery } = await import("../src/query.js");

// Helper: create a fresh query client for each test
const makeClient = (opts = {}) =>
  createQuery({ defaultRetries: 0, defaultRetryDelay: 0, ...opts });

describe("createQuery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EVT.clear();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── query() ──────────────────────────────────────────────

  describe("query()", () => {
    it("fetches data and caches it", async () => {
      const client = makeClient();
      const fetcher = vi.fn().mockResolvedValue({ id: 1 });

      const data = await client.query("users", fetcher);

      expect(data).toEqual({ id: 1 });
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("returns cached data when still fresh", async () => {
      const client = makeClient({ defaultStaleTime: 10000 });
      const fetcher = vi.fn().mockResolvedValue("fresh");

      await client.query("key", fetcher);
      const second = await client.query("key", fetcher);

      expect(second).toBe("fresh");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("re-fetches when data is stale but returns stale data", async () => {
      const client = makeClient({ defaultStaleTime: 100, defaultTtl: 60000 });
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce("v1")
        .mockResolvedValueOnce("v2");

      await client.query("key", fetcher);

      // Advance past staleTime but not ttl
      vi.advanceTimersByTime(200);

      // Stale-while-revalidate: returns stale data while re-fetching
      const result = await client.query("key", fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result).toBe("v1");
    });

    it("returns stale data while re-fetching in background", async () => {
      const client = makeClient({ defaultStaleTime: 100, defaultTtl: 60000 });
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce("v1")
        .mockResolvedValueOnce("v2");

      await client.query("key", fetcher);

      // Make data stale but not expired
      vi.advanceTimersByTime(200);

      // Should return stale data immediately
      const result = await client.query("key", fetcher);
      // stale-while-revalidate returns old data
      expect(result).toBe("v1");
    });

    it("deduplicates concurrent requests for the same key", async () => {
      const client = makeClient();
      const fetcher = vi.fn().mockResolvedValue("data");

      const [a, b] = await Promise.all([
        client.query("key", fetcher),
        client.query("key", fetcher),
      ]);

      expect(a).toBe("data");
      expect(b).toBe("data");
      expect(fetcher).toHaveBeenCalledOnce();
    });

    it("emits success event on fetch", async () => {
      const client = makeClient();
      const handler = vi.fn();
      EVT.sub("query:key:success", handler);

      await client.query("key", () => Promise.resolve("ok"));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "ok" }),
      );
    });

    it("emits error event on failure", async () => {
      const client = makeClient();
      const handler = vi.fn();
      EVT.sub("query:key:error", handler);

      await client
        .query("key", () => Promise.reject(new Error("fail")))
        .catch(() => {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );
    });
  });

  // ── fetchWithRetry ───────────────────────────────────────

  describe("retry behavior", () => {
    it("retries on failure up to configured retries", async () => {
      const client = makeClient({
        defaultRetries: 2,
        defaultRetryDelay: 10,
      });

      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error("1"))
        .mockRejectedValueOnce(new Error("2"))
        .mockResolvedValue("ok");

      const promise = client.query("key", fetcher);
      // Advance through retry delays (exponential: 10, 20)
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(20);

      const result = await promise;
      expect(result).toBe("ok");
      expect(fetcher).toHaveBeenCalledTimes(3);
    });

    it("throws last error after all retries exhausted", async () => {
      const client = makeClient({
        defaultRetries: 1,
        defaultRetryDelay: 10,
      });

      const fetcher = vi
        .fn()
        .mockRejectedValueOnce(new Error("err1"))
        .mockRejectedValueOnce(new Error("err2"));

      const promise = client.query("key", fetcher);
      // Catch the internal re-throw to avoid unhandled rejection
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(10);

      await expect(promise).rejects.toThrow("err2");
    });
  });

  // ── mutate() ─────────────────────────────────────────────

  describe("mutate()", () => {
    it("updates cached data with a value", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve({ count: 1 }));

      const previous = client.mutate("key", { count: 2 });

      expect(previous).toEqual({ count: 1 });
      expect(client.getEntry("key").data).toEqual({ count: 2 });
    });

    it("updates cached data with a function", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve({ count: 1 }));

      client.mutate("key", (prev) => ({ count: prev.count + 1 }));

      expect(client.getEntry("key").data).toEqual({ count: 2 });
    });

    it("returns null if key does not exist", () => {
      const client = makeClient();
      expect(client.mutate("nonexistent", "value")).toBeNull();
    });

    it("emits mutate event", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("old"));

      const handler = vi.fn();
      EVT.sub("query:key:mutate", handler);

      client.mutate("key", "new");

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "new", previous: "old" }),
      );
    });
  });

  // ── setQueryData() ──────────────────────────────────────

  describe("setQueryData()", () => {
    it("sets data directly in the cache", () => {
      const client = makeClient();
      client.setQueryData("key", { name: "test" });

      const entry = client.getEntry("key");
      expect(entry.data).toEqual({ name: "test" });
      expect(entry.error).toBeNull();
    });

    it("emits set event", () => {
      const client = makeClient();
      const handler = vi.fn();
      EVT.sub("query:key:set", handler);

      client.setQueryData("key", "data");

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ data: "data" }),
      );
    });
  });

  // ── invalidate() ─────────────────────────────────────────

  describe("invalidate()", () => {
    it("removes cached entry", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("data"));

      client.invalidate("key");

      expect(client.getEntry("key")).toBeNull();
    });

    it("emits invalidate event", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("data"));

      const handler = vi.fn();
      EVT.sub("query:key:invalidate", handler);

      client.invalidate("key");

      expect(handler).toHaveBeenCalled();
    });

    it("refetches when refetch option is set with a fetcher", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("old"));

      const fetcher = vi.fn().mockResolvedValue("new");
      await client.invalidate("key", { refetch: true, fetcher });

      expect(fetcher).toHaveBeenCalledOnce();
      expect(client.getEntry("key").data).toBe("new");
    });
  });

  // ── invalidateMatching() ─────────────────────────────────

  describe("invalidateMatching()", () => {
    it("removes entries matching the predicate", async () => {
      const client = makeClient();
      await client.query("users-1", () => Promise.resolve("a"));
      await client.query("users-2", () => Promise.resolve("b"));
      await client.query("posts-1", () => Promise.resolve("c"));

      const invalidated = client.invalidateMatching((k) =>
        k.startsWith("users"),
      );

      expect(invalidated).toEqual(["users-1", "users-2"]);
      expect(client.getEntry("users-1")).toBeNull();
      expect(client.getEntry("users-2")).toBeNull();
      expect(client.getEntry("posts-1")).not.toBeNull();
    });
  });

  // ── subscribe() ──────────────────────────────────────────

  describe("subscribe()", () => {
    it("calls back immediately if entry exists", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("data"));

      const callback = vi.fn();
      client.subscribe("key", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ data: "data" }),
      );
    });

    it("calls back on success events", async () => {
      const client = makeClient({ defaultStaleTime: 0 });
      const callback = vi.fn();
      client.subscribe("key", callback);

      await client.query("key", () => Promise.resolve("fetched"));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ data: "fetched" }),
      );
    });

    it("calls back with null on invalidation", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("data"));

      const callback = vi.fn();
      client.subscribe("key", callback);

      client.invalidate("key");

      expect(callback).toHaveBeenCalledWith(null);
    });

    it("returns an unsubscribe function", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("data"));

      const callback = vi.fn();
      const unsub = client.subscribe("key", callback);

      callback.mockClear();
      unsub();

      client.mutate("key", "updated");
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ── getEntry() ───────────────────────────────────────────

  describe("getEntry()", () => {
    it("returns null for unknown keys", () => {
      const client = makeClient();
      expect(client.getEntry("nope")).toBeNull();
    });

    it("returns the cache entry for a known key", async () => {
      const client = makeClient();
      await client.query("key", () => Promise.resolve("data"));

      const entry = client.getEntry("key");
      expect(entry).toMatchObject({ data: "data", promise: null });
    });
  });

  // ── gc() ─────────────────────────────────────────────────

  describe("gc()", () => {
    it("removes expired entries without active subscribers", async () => {
      const client = makeClient({ defaultTtl: 100, defaultStaleTime: 50 });
      await client.query("key", () => Promise.resolve("data"));

      vi.advanceTimersByTime(200);
      client.gc();

      expect(client.getEntry("key")).toBeNull();
    });
  });

  // ── clear() ──────────────────────────────────────────────

  describe("clear()", () => {
    it("clears all cache entries and storage", async () => {
      const client = makeClient();
      await client.query("a", () => Promise.resolve(1));
      await client.query("b", () => Promise.resolve(2));

      client.clear();

      expect(client.getEntry("a")).toBeNull();
      expect(client.getEntry("b")).toBeNull();
    });
  });

  // ── polling ──────────────────────────────────────────────

  describe("polling", () => {
    it("startPolling fetches immediately and on interval", async () => {
      const client = makeClient();
      const fetcher = vi.fn().mockResolvedValue("data");

      client.startPolling("key", fetcher, 1000);

      // Initial fetch
      await vi.advanceTimersByTimeAsync(0);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // After interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetcher).toHaveBeenCalledTimes(2);

      client.stopPolling("key");
    });

    it("stopPolling clears the interval", async () => {
      const client = makeClient();
      const fetcher = vi.fn().mockResolvedValue("data");

      client.startPolling("key", fetcher, 1000);
      await vi.advanceTimersByTimeAsync(0);

      client.stopPolling("key");

      await vi.advanceTimersByTimeAsync(5000);
      // Only the initial fetch, no more after stop
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("stopAllPolling stops every active poll", async () => {
      const client = makeClient();
      const f1 = vi.fn().mockResolvedValue("a");
      const f2 = vi.fn().mockResolvedValue("b");

      client.startPolling("k1", f1, 1000);
      client.startPolling("k2", f2, 1000);
      await vi.advanceTimersByTimeAsync(0);

      client.stopAllPolling();

      await vi.advanceTimersByTimeAsync(5000);
      expect(f1).toHaveBeenCalledTimes(1);
      expect(f2).toHaveBeenCalledTimes(1);
    });

    it("startPolling returns a stop function", async () => {
      const client = makeClient();
      const fetcher = vi.fn().mockResolvedValue("data");

      const stop = client.startPolling("key", fetcher, 1000);
      await vi.advanceTimersByTimeAsync(0);

      stop();

      await vi.advanceTimersByTimeAsync(5000);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  // ── prefetch() ───────────────────────────────────────────

  describe("prefetch()", () => {
    it("fetches data into cache without returning it", async () => {
      const client = makeClient();
      const fetcher = vi.fn().mockResolvedValue("prefetched");

      client.prefetch("key", fetcher);
      await vi.advanceTimersByTimeAsync(0);

      expect(client.getEntry("key").data).toBe("prefetched");
    });

    it("does not re-fetch if data is still fresh", async () => {
      const client = makeClient({ defaultStaleTime: 10000 });
      const fetcher = vi.fn().mockResolvedValue("data");

      await client.query("key", fetcher);
      client.prefetch("key", fetcher);

      expect(fetcher).toHaveBeenCalledOnce();
    });
  });
});
