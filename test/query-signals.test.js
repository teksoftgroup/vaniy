import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import EVT from "../src/evt.js";

// ── Browser API mocks ────────────────────────────────────────────────────────

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

// Dynamic import so the stubs above are in place when the module loads.
const { queryClient } = await import("../src/query.js");
const { querySignal, pollingSignal, bindQuery } = queryClient;

// ── Helpers ──────────────────────────────────────────────────────────────────

function freshKey() {
  return `test-${Math.random().toString(36).slice(2)}`;
}

// ── querySignal() ─────────────────────────────────────────────────────────────

describe("querySignal()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EVT.clear();
    localStorageMock.clear();
    queryClient.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the expected shape", () => {
    const qs = querySignal(freshKey(), () => Promise.resolve("x"), {
      enabled: false,
    });
    expect(qs).toHaveProperty("data");
    expect(qs).toHaveProperty("loading");
    expect(qs).toHaveProperty("error");
    expect(typeof qs.fetch).toBe("function");
    expect(typeof qs.refetch).toBe("function");
    expect(typeof qs.unsubscribe).toBe("function");
    expect(typeof qs.mutate).toBe("function");
  });

  it("data signal is null initially when enabled: false", () => {
    const qs = querySignal(freshKey(), () => Promise.resolve("x"), {
      enabled: false,
    });
    expect(qs.data.val).toBeNull();
  });

  it("data signal is null initially when inital option not provided", () => {
    const qs = querySignal(freshKey(), () => Promise.resolve("x"), {
      enabled: false,
    });
    expect(qs.data.val).toBeNull();
  });

  it("error signal starts as null", () => {
    const qs = querySignal(freshKey(), () => Promise.resolve("x"), {
      enabled: false,
    });
    expect(qs.error.val).toBeNull();
  });

  it("does not call fetcher when enabled: false", () => {
    const fetcher = vi.fn().mockResolvedValue("data");
    querySignal(freshKey(), fetcher, { enabled: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("auto-fetches when enabled is not explicitly set", async () => {
    const key = freshKey();
    const fetcher = vi.fn().mockResolvedValue("auto");
    querySignal(key, fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("data.val is populated after fetch() resolves", async () => {
    const key = freshKey();
    const qs = querySignal(key, () => Promise.resolve("fetched"), {
      enabled: false,
    });
    await qs.fetch();
    expect(qs.data.val).toBe("fetched");
  });

  it("mutate() updates data.val using a value", async () => {
    const key = freshKey();
    const qs = querySignal(key, () => Promise.resolve({ count: 1 }), {
      enabled: false,
    });
    await qs.fetch();
    qs.mutate({ count: 99 });
    expect(qs.data.val).toEqual({ count: 99 });
  });

  it("mutate() updates data.val using an updater function", async () => {
    const key = freshKey();
    const qs = querySignal(key, () => Promise.resolve({ count: 1 }), {
      enabled: false,
    });
    await qs.fetch();
    qs.mutate((prev) => ({ count: prev.count + 1 }));
    expect(qs.data.val).toEqual({ count: 2 });
  });

  it("refetch() fetches fresh data after invalidation", async () => {
    const key = freshKey();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce("v1")
      .mockResolvedValueOnce("v2");
    const qs = querySignal(key, fetcher, { enabled: false });

    await qs.fetch();
    expect(qs.data.val).toBe("v1");

    await qs.refetch();
    expect(qs.data.val).toBe("v2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe() does not throw", async () => {
    const qs = querySignal(freshKey(), () => Promise.resolve("x"), {
      enabled: false,
    });
    expect(() => qs.unsubscribe()).not.toThrow();
  });

  it("data is shared with queryClient for the same key", async () => {
    const key = freshKey();
    const qs = querySignal(key, () => Promise.resolve("shared"), {
      enabled: false,
    });
    await qs.fetch();
    expect(queryClient.getEntry(key)?.data).toBe("shared");
  });
});

// ── pollingSignal() ───────────────────────────────────────────────────────────

describe("pollingSignal()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EVT.clear();
    localStorageMock.clear();
    queryClient.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the querySignal shape plus a stop function", () => {
    const key = freshKey();
    const ps = pollingSignal(key, vi.fn().mockResolvedValue("x"), 1000);
    expect(ps).toHaveProperty("data");
    expect(ps).toHaveProperty("loading");
    expect(ps).toHaveProperty("error");
    expect(typeof ps.stop).toBe("function");
    ps.stop();
  });

  it("starts polling and fetches on interval", async () => {
    const key = freshKey();
    const fetcher = vi.fn().mockResolvedValue("data");
    const ps = pollingSignal(key, fetcher, 1000);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(2);

    ps.stop();
  });

  it("stop() halts polling", async () => {
    const key = freshKey();
    const fetcher = vi.fn().mockResolvedValue("data");
    const ps = pollingSignal(key, fetcher, 1000);

    await vi.advanceTimersByTimeAsync(0);
    ps.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

// ── bindQuery() ───────────────────────────────────────────────────────────────

describe("bindQuery()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    EVT.clear();
    localStorageMock.clear();
    queryClient.clear();

    document.body.innerHTML = '<div id="output"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders to element when success event fires", () => {
    const key = freshKey();
    const el = document.querySelector("#output");

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: el,
      render: (data) => `<p>${data}</p>`,
    });

    EVT.pub(`query:${key}:success`, { data: "hello" });
    expect(el.innerHTML).toBe("<p>hello</p>");
  });

  it("updates element when set event fires", () => {
    const key = freshKey();
    const el = document.querySelector("#output");

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: el,
      render: (data) => `<span>${data}</span>`,
    });

    EVT.pub(`query:${key}:set`, { data: "set-data" });
    expect(el.innerHTML).toBe("<span>set-data</span>");
  });

  it("updates element when mutate event fires", () => {
    const key = freshKey();
    const el = document.querySelector("#output");

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: el,
      render: (data) => `<b>${data}</b>`,
    });

    EVT.pub(`query:${key}:mutate`, { data: "mutated" });
    expect(el.innerHTML).toBe("<b>mutated</b>");
  });

  it("calls onError when error event fires", () => {
    const key = freshKey();
    const el = document.querySelector("#output");
    const onError = vi.fn();

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: el,
      render: () => "",
      onError,
    });

    const err = new Error("bad");
    EVT.pub(`query:${key}:error`, { error: err, staleData: null });

    expect(onError).toHaveBeenCalledWith(err, null, el);
  });

  it("calls onLoading when fetch event fires with no cache", () => {
    const key = freshKey();
    const el = document.querySelector("#output");
    const onLoading = vi.fn();

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: el,
      render: () => "",
      onLoading,
    });

    EVT.pub(`query:${key}:fetch`, { hasCache: false });
    expect(onLoading).toHaveBeenCalledWith(el);
  });

  it("does not call onLoading when hasCache is true", () => {
    const key = freshKey();
    const el = document.querySelector("#output");
    const onLoading = vi.fn();

    // Pre-populate cache so the immediate query() call inside bindQuery
    // fires with hasCache:true (stale but not expired), preventing onLoading.
    queryClient.setQueryData(key, "cached", { staleTime: 0, ttl: 60000 });

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: el,
      render: () => "",
      onLoading,
    });

    // Emit a fetch event simulating a stale re-fetch (hasCache: true)
    onLoading.mockClear();
    EVT.pub(`query:${key}:fetch`, { hasCache: true });
    expect(onLoading).not.toHaveBeenCalled();
  });

  it("accepts a CSS selector string as target", () => {
    const key = freshKey();

    bindQuery(key, vi.fn().mockResolvedValue([]), {
      target: "#output",
      render: (data) => `<i>${data}</i>`,
    });

    EVT.pub(`query:${key}:success`, { data: "selector" });
    expect(document.querySelector("#output").innerHTML).toBe(
      "<i>selector</i>",
    );
  });

  it("starts polling when poll option is provided and returns stop fn", async () => {
    const key = freshKey();
    const fetcher = vi.fn().mockResolvedValue("polled");
    const el = document.querySelector("#output");

    const stop = bindQuery(key, fetcher, {
      target: el,
      render: (d) => d,
      poll: 1000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalled();
    expect(typeof stop).toBe("function");
    stop();
  });
});
