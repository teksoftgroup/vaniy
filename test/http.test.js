import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import HTTP, { request, get, post, put, del } from "../src/http.js";

function makeFetchResponse({
  ok = true,
  status = 200,
  jsonData,
  textData,
  headers = {},
  body = null,
} = {}) {
  const h = new Headers(headers);

  return {
    ok,
    status,
    headers: h,
    body,
    async json() {
      if (jsonData instanceof Error) throw jsonData;
      if (jsonData !== undefined) return jsonData;
      throw new Error("No JSON");
    },
    async text() {
      return textData ?? "";
    },
    async blob() {
      return new Blob([textData ?? ""], {
        type: headers["Content-Type"] || "",
      });
    },
    statusText: "ERR",
  };
}

describe("http.js", () => {
  beforeEach(() => {
    // reset module config (bearer(null) clears token fn, status handlers persist but
    // existing tests only use 200 responses so they don't conflict)
    HTTP.base("").timeout(8000).interceptRequest(null).interceptResponse(null).bearer(null);

    // clear localStorage between tests (used by local storage cache tests)
    window.localStorage.clear();
    window.sessionStorage.clear();

    // mock fetch + timers
    vi.useFakeTimers();
    global.fetch = vi.fn();

    // JSDOM: stub URL methods used by download()
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    // stub <a>.click
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("base() and timeout() are chainable", () => {
    const res = HTTP.base("https://api.example.com").timeout(1234);
    expect(res).toBe(HTTP);
  });

  it("ping() logs PONG", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    HTTP.ping();
    expect(spy).toHaveBeenCalledWith("PONG");
  });

  it("falls back to text when response JSON parse fails", async () => {
    // Passing no jsonData means res.json() throws → falls back to res.text()
    global.fetch.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, textData: "plain text" }),
    );

    const data = await HTTP.get("/text-only");
    expect(data).toBe("plain text");
  });

  it("request(GET) builds URL with base + params and calls fetch", async () => {
    global.fetch.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, jsonData: { ok: 1 } }),
    );

    HTTP.base("https://api.example.com");

    const data = await request("GET", "/users", { params: { a: "1", b: "2" } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, cfg] = global.fetch.mock.calls[0];

    expect(calledUrl).toBe("https://api.example.com/users?a=1&b=2");
    expect(cfg.method).toBe("GET");
    expect(data).toEqual({ ok: 1 });
  });

  it("request(POST) sends JSON body and sets Content-Type", async () => {
    global.fetch.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
    );

    const body = { hello: "world" };
    await HTTP.post("/x", body);

    const [, cfg] = global.fetch.mock.calls[0];
    expect(cfg.method).toBe("POST");
    expect(cfg.headers["Content-Type"]).toBe("application/json");
    expect(cfg.body).toBe(JSON.stringify(body));
  });

  it("requestInterceptor can modify config", async () => {
    global.fetch.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
    );

    HTTP.interceptRequest((cfg) => {
      cfg.headers = { ...cfg.headers, "X-Test": "1" };
      return cfg;
    });

    await HTTP.get("/hello");

    const [, cfg] = global.fetch.mock.calls[0];
    expect(cfg.headers["X-Test"]).toBe("1");
  });

  it("responseInterceptor is called with Response and can replace it", async () => {
    const res1 = makeFetchResponse({
      ok: true,
      status: 200,
      jsonData: { a: 1 },
    });
    const res2 = makeFetchResponse({
      ok: true,
      status: 200,
      jsonData: { a: 999 },
    });

    global.fetch.mockResolvedValue(res1);

    const spy = vi.fn((r) => {
      // replace response with res2
      return res2;
    });

    HTTP.interceptResponse(spy);

    const data = await HTTP.get("/x");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ a: 999 });
  });

  describe("caching", () => {
    it("cache-first returns cached value without calling fetch", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { from: "net" } }),
      );

      const cache = {
        strategy: "cache-first",
        ttl: 10_000,
        storage: "memory",
      };

      // First call stores in cache
      const a = await HTTP.get("/cached", { cache });
      expect(a).toEqual({ from: "net" });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call should hit cache and not call fetch again
      const b = await HTTP.get("/cached", { cache });
      expect(b).toEqual({ from: "net" });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("cache-first respects forceRefresh and goes to network", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { v: 1 } }),
      );

      const cache = { strategy: "cache-first", ttl: 10_000, storage: "memory" };

      await HTTP.get("/x", { cache });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({ ok: true, status: 200, jsonData: { v: 2 } }),
      );

      const v2 = await HTTP.get("/x", {
        cache: { ...cache, forceRefresh: true },
      });
      expect(v2).toEqual({ v: 2 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("network-first falls back to cache on non-ok response", async () => {
      // Seed cache
      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({
          ok: true,
          status: 200,
          jsonData: { cached: "seed" },
        }),
      );

      const cache = {
        strategy: "network-first",
        ttl: 10_000,
        storage: "memory",
      };
      await HTTP.get("/nf", { cache });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Next call fails => should fallback to cached
      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({ ok: false, status: 500, jsonData: { err: true } }),
      );

      const data = await HTTP.get("/nf", { cache });
      expect(data).toEqual({ cached: "seed" });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("network-first falls back to cache on fetch throw (network error)", async () => {
      // seed
      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({ ok: true, status: 200, jsonData: { cached: 1 } }),
      );
      const cache = {
        strategy: "network-first",
        ttl: 10_000,
        storage: "memory",
      };
      await HTTP.get("/err", { cache });

      // now throw
      global.fetch.mockRejectedValueOnce(new Error("Network down"));

      const data = await HTTP.get("/err", { cache });
      expect(data).toEqual({ cached: 1 });
    });

    it("local storage adapter caches and serves data on second request", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { from: "net" } }),
      );

      const cache = { strategy: "cache-first", ttl: 10_000, storage: "local" };

      const a = await HTTP.get("/ls", { cache });
      expect(a).toEqual({ from: "net" });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Second call should be served from localStorage, not fetch
      const b = await HTTP.get("/ls", { cache });
      expect(b).toEqual({ from: "net" });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("local storage adapter returns null for expired entries and re-fetches", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { v: 1 } }),
      );

      const cache = { strategy: "cache-first", ttl: 100, storage: "local" };
      await HTTP.get("/ls-ttl", { cache });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // advance beyond TTL so the stored entry expires
      vi.advanceTimersByTime(200);

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { v: 2 } }),
      );

      const data = await HTTP.get("/ls-ttl", { cache });
      expect(data).toEqual({ v: 2 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("local storage adapter handles a corrupted JSON entry and falls through to network", async () => {
      // Pre-seed localStorage with invalid JSON under the key that buildCacheKey would generate
      const cacheKey = "H|GET|/corrupt";
      window.localStorage.setItem(cacheKey, "not-valid-json");

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { fresh: true } }),
      );

      const cache = {
        strategy: "cache-first",
        key: cacheKey,
        storage: "local",
      };
      const data = await HTTP.get("/corrupt", { cache });
      expect(data).toEqual({ fresh: true });
    });

    it("cache TTL expires (memory storage)", async () => {
      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({ ok: true, status: 200, jsonData: { v: 1 } }),
      );

      const cache = { strategy: "cache-first", ttl: 1000, storage: "memory" };
      await HTTP.get("/ttl", { cache });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // advance time beyond ttl
      vi.advanceTimersByTime(1500);

      global.fetch.mockResolvedValueOnce(
        makeFetchResponse({ ok: true, status: 200, jsonData: { v: 2 } }),
      );

      const data = await HTTP.get("/ttl", { cache });
      expect(data).toEqual({ v: 2 });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("download()", () => {
    it("throws when response is not ok", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: false,
          status: 404,
          textData: "Not Found",
        }),
      );

      await expect(HTTP.download("/missing")).rejects.toThrow(
        "Download failed 404",
      );
    });

    it("uses fallback blob() when body.getReader is not available", async () => {
      const onProgress = vi.fn();

      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          status: 200,
          headers: { "Content-Disposition": 'attachment; filename="blob.txt"' },
          textData: "fallback content",
          // body is null → will use res.blob() path
        }),
      );

      const res = await HTTP.download("/dl-blob", { onProgress });
      expect(res.filename).toBe("blob.txt");
      // onProgress(1, 1, 100) is called for the non-streaming path
      expect(onProgress).toHaveBeenCalledWith(1, 1, 100);
    });

    it("infers filename from Content-Disposition and triggers anchor click", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          status: 200,
          headers: {
            "Content-Disposition": 'attachment; filename="file.txt"',
            "Content-Type": "text/plain",
          },
          textData: "hello",
        }),
      );

      const res = await HTTP.download("/dl");

      expect(res.filename).toBe("file.txt");
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    });

    it("streams with progress when body.getReader exists", async () => {
      const onProgress = vi.fn();

      const reader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new Uint8Array([1, 2, 3]),
          })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5]) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const body = { getReader: () => reader };

      global.fetch.mockResolvedValue(
        makeFetchResponse({
          ok: true,
          status: 200,
          headers: {
            "Content-Disposition": "attachment; filename=stream.bin",
            "Content-Length": "5",
          },
          body,
        }),
      );

      const res = await HTTP.download("/dl2", { onProgress });

      expect(res.filename).toBe("stream.bin");
      expect(onProgress).toHaveBeenCalled();
      // Should get 100% at the end when content-length is known
      expect(onProgress.mock.calls.at(-1)[2]).toBe(100);
    });
  });

  describe("upload()", () => {
    function installMockXMLHttpRequest(xhr) {
      const Original = globalThis.XMLHttpRequest;

      let createdCount = 0;

      class MockXMLHttpRequest {
        constructor() {
          createdCount++;
          return xhr; // returning an object from a constructor is valid
        }
      }

      globalThis.XMLHttpRequest = MockXMLHttpRequest;

      return {
        restore() {
          globalThis.XMLHttpRequest = Original;
        },
        getCreatedCount() {
          return createdCount;
        },
      };
    }

    function mockXHR({
      status = 200,
      responseText = "{}",
      contentType = "application/json",
    } = {}) {
      const xhr = {
        readyState: 0,
        status,
        responseText,
        timeout: 0,
        upload: {},
        _headers: {},
        open: vi.fn(),
        setRequestHeader: vi.fn((k, v) => (xhr._headers[k] = v)),
        getResponseHeader: vi.fn((name) =>
          name === "Content-Type" ? contentType : "",
        ),
        send: vi.fn(),
        abort: vi.fn(),
        onreadystatechange: null,
        onerror: null,
        ontimeout: null,
      };

      return xhr;
    }

    it("upload works", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: JSON.stringify({ ok: true }),
      });

      const OriginalXHR = globalThis.XMLHttpRequest;

      class MockXMLHttpRequest {
        constructor() {
          return xhr; // returning an object from a constructor is allowed in JS
        }
      }

      globalThis.XMLHttpRequest = MockXMLHttpRequest;

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]) });

        // finish
        xhr.readyState = 4;
        xhr.onreadystatechange?.();

        await expect(p).resolves.toEqual({ ok: true });
      } finally {
        globalThis.XMLHttpRequest = OriginalXHR; // restore
      }
    });

    it("uploads FormData via XHR, applies request interceptor headers, parses JSON response", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: JSON.stringify({ ok: true }),
        contentType: "application/json",
      });

      const { restore, getCreatedCount } = installMockXMLHttpRequest(xhr);

      HTTP.base("https://api.example.com")
        .timeout(9999)
        .interceptRequest((cfg) => {
          cfg.headers["X-Auth"] = "token";
          return cfg;
        });

      try {
        const p = HTTP.upload("/up", {
          files: new Blob(["x"], { type: "text/plain" }),
          fieldName: "file",
          fields: { name: "Pascal" },
        });

        xhr.readyState = 4;
        xhr.onreadystatechange?.();

        const data = await p;

        expect(getCreatedCount()).toBe(1);
        expect(xhr.open).toHaveBeenCalledWith(
          "POST",
          "https://api.example.com/up",
          true,
        );
        expect(xhr.timeout).toBe(9999);
        expect(xhr.setRequestHeader).toHaveBeenCalledWith("X-Auth", "token");
        expect(data).toEqual({ ok: true });
      } finally {
        restore();
      }
    });

    it("upload calls onProgress with computable length", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: JSON.stringify({ ok: 1 }),
        contentType: "application/json",
      });

      const { restore } = installMockXMLHttpRequest(xhr);

      const onProgress = vi.fn();

      try {
        const p = HTTP.upload("/up", {
          files: new Blob(["x"]),
          onProgress,
        });

        // trigger progress
        xhr.upload.onprogress?.({
          loaded: 50,
          total: 100,
          lengthComputable: true,
        });
        xhr.upload.onprogress?.({
          loaded: 100,
          total: 100,
          lengthComputable: true,
        });

        // finish
        xhr.readyState = 4;
        xhr.onreadystatechange?.();

        await p;

        expect(onProgress).toHaveBeenCalledWith(50, 100, 50);
        expect(onProgress).toHaveBeenCalledWith(100, 100, 100);
      } finally {
        restore();
      }
    });

    it("upload rejects on http error (non-2xx) with parsed payload", async () => {
      const xhr = mockXHR({
        status: 400,
        responseText: JSON.stringify({ msg: "bad" }),
        contentType: "application/json",
      });

      const { restore } = installMockXMLHttpRequest(xhr);

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]) });

        xhr.readyState = 4;
        xhr.onreadystatechange?.();

        await expect(p).rejects.toMatchObject({
          status: 400,
          data: { msg: "bad" },
          method: "POST",
        });
      } finally {
        restore();
      }
    });

    it("upload rejects on timeout", async () => {
      const xhr = mockXHR();
      const { restore } = installMockXMLHttpRequest(xhr);

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]) });

        xhr.ontimeout?.();

        await expect(p).rejects.toMatchObject({
          status: 0,
          data: "Timeout",
        });
      } finally {
        restore();
      }
    });

    it("upload calls onProgress with null totals when length is not computable", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: "{}",
        contentType: "application/json",
      });
      const { restore } = installMockXMLHttpRequest(xhr);
      const onProgress = vi.fn();

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]), onProgress });

        // fire progress without computable length
        xhr.upload.onprogress?.({ loaded: 50, total: 0, lengthComputable: false });

        xhr.readyState = 4;
        xhr.onreadystatechange?.();
        await p;

        expect(onProgress).toHaveBeenCalledWith(50, null, null);
      } finally {
        restore();
      }
    });

    it("upload calls responseInterceptor with a fake response object", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: "{}",
        contentType: "application/json",
      });
      const { restore } = installMockXMLHttpRequest(xhr);
      const interceptor = vi.fn();
      HTTP.interceptResponse(interceptor);

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]) });

        xhr.readyState = 4;
        xhr.onreadystatechange?.();
        await p;

        expect(interceptor).toHaveBeenCalledTimes(1);
        const [fakeRes] = interceptor.mock.calls[0];
        expect(fakeRes.status).toBe(200);
        expect(fakeRes.ok).toBe(true);
        expect(typeof fakeRes.json).toBe("function");
      } finally {
        restore();
      }
    });

    it("upload includes bearer token header via a function token", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: "{}",
        contentType: "application/json",
      });
      const { restore } = installMockXMLHttpRequest(xhr);
      HTTP.bearer(() => "fn-upload-token");

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]) });

        xhr.readyState = 4;
        xhr.onreadystatechange?.();
        await p;

        expect(xhr.setRequestHeader).toHaveBeenCalledWith(
          "Authorization",
          "Bearer fn-upload-token",
        );
      } finally {
        restore();
      }
    });

    it("upload safeJson returns raw text when response JSON is malformed", async () => {
      const xhr = mockXHR({
        status: 200,
        responseText: "not-valid-json",
        contentType: "application/json",
      });
      const { restore } = installMockXMLHttpRequest(xhr);

      try {
        const p = HTTP.upload("/up", { files: new Blob(["x"]) });

        xhr.readyState = 4;
        xhr.onreadystatechange?.();

        // JSON.parse("not-valid-json") throws → safeJson catch → returns raw string
        await expect(p).resolves.toBe("not-valid-json");
      } finally {
        restore();
      }
    });

    it("upload aborts when signal is aborted", async () => {
      const xhr = mockXHR();
      const { restore } = installMockXMLHttpRequest(xhr);

      try {
        const ac = new AbortController();

        const p = HTTP.upload("/up", {
          files: new Blob(["x"]),
          signal: ac.signal,
        });

        ac.abort();

        expect(xhr.abort).toHaveBeenCalled();

        // finish with a network error so promise resolves/rejects
        xhr.onerror?.();

        await expect(p).rejects.toMatchObject({ status: 0 });
      } finally {
        restore();
      }
    });
  });

  describe("bearer()", () => {
    it("is chainable", () => {
      expect(HTTP.bearer("tok")).toBe(HTTP);
    });

    it("adds Authorization: Bearer <token> header to requests", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
      );

      HTTP.bearer("my-secret-token");
      await HTTP.get("/protected");

      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.headers["Authorization"]).toBe("Bearer my-secret-token");
    });

    it("resolves token from a function on each request", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: {} }),
      );

      let token = "token-v1";
      HTTP.bearer(() => token);
      await HTTP.get("/a");

      const [, cfg1] = global.fetch.mock.calls[0];
      expect(cfg1.headers["Authorization"]).toBe("Bearer token-v1");

      token = "token-v2";
      await HTTP.get("/b");

      const [, cfg2] = global.fetch.mock.calls[1];
      expect(cfg2.headers["Authorization"]).toBe("Bearer token-v2");
    });

    it("uses a custom header name without the Bearer prefix", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: {} }),
      );

      HTTP.bearer("my-api-key", "X-API-Key");
      await HTTP.get("/api");

      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.headers["X-API-Key"]).toBe("my-api-key");
      expect(cfg.headers["Authorization"]).toBeUndefined();
    });

    it("does not add header when token is null", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: {} }),
      );

      HTTP.bearer(null);
      await HTTP.get("/open");

      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.headers["Authorization"]).toBeUndefined();
    });

    it("does not add header when token function returns null", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: {} }),
      );

      HTTP.bearer(() => null);
      await HTTP.get("/open");

      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.headers["Authorization"]).toBeUndefined();
    });
  });

  describe("status handlers", () => {
    it("onStatus() is chainable", () => {
      const result = HTTP.onStatus(418, () => {});
      expect(result).toBe(HTTP);
    });

    it("onUnauthorized() is chainable", () => {
      expect(HTTP.onUnauthorized(() => {})).toBe(HTTP);
    });

    it("onForbidden() is chainable", () => {
      expect(HTTP.onForbidden(() => {})).toBe(HTTP);
    });

    it("onInternalServerError() is chainable", () => {
      expect(HTTP.onInternalServerError(() => {})).toBe(HTTP);
    });

    it("onStatus() fires the handler when response has the matching status", async () => {
      const handler = vi.fn();
      HTTP.onStatus(418, handler);

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: false, status: 418, jsonData: { err: "teapot" } }),
      );

      await HTTP.get("/brew").catch(() => {});

      expect(handler).toHaveBeenCalledTimes(1);
      const [res, ctx] = handler.mock.calls[0];
      expect(res.status).toBe(418);
      expect(ctx).toMatchObject({ method: "GET" });
    });

    it("onUnauthorized() fires for 401 responses", async () => {
      const handler = vi.fn();
      HTTP.onUnauthorized(handler);

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: false, status: 401, jsonData: { msg: "unauth" } }),
      );

      await HTTP.get("/secure").catch(() => {});

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].status).toBe(401);
    });

    it("onForbidden() fires for 403 responses", async () => {
      const handler = vi.fn();
      HTTP.onForbidden(handler);

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: false, status: 403, jsonData: { msg: "forbidden" } }),
      );

      await HTTP.get("/admin").catch(() => {});

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].status).toBe(403);
    });

    it("onInternalServerError() fires for 500 responses", async () => {
      const handler = vi.fn();
      HTTP.onInternalServerError(handler);

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: false, status: 500, jsonData: { msg: "crash" } }),
      );

      await HTTP.get("/broken").catch(() => {});

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].status).toBe(500);
    });

    it("status handler does not fire for non-matching status codes", async () => {
      const handler = vi.fn();
      HTTP.onStatus(404, handler);

      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
      );

      await HTTP.get("/ok");

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("convenience methods", () => {
    it("get() calls request with GET method", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { method: "GET" } }),
      );
      const data = await get("/test");
      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.method).toBe("GET");
      expect(data).toEqual({ method: "GET" });
    });

    it("post() calls request with POST method and body", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
      );
      await post("/test", { name: "Alice" });
      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.method).toBe("POST");
      expect(cfg.body).toBe(JSON.stringify({ name: "Alice" }));
    });

    it("put() calls request with PUT method and body", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
      );
      await put("/test", { id: 1 });
      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.method).toBe("PUT");
      expect(cfg.body).toBe(JSON.stringify({ id: 1 }));
    });

    it("del() calls request with DELETE method", async () => {
      global.fetch.mockResolvedValue(
        makeFetchResponse({ ok: true, status: 200, jsonData: { ok: true } }),
      );
      await del("/test");
      const [, cfg] = global.fetch.mock.calls[0];
      expect(cfg.method).toBe("DELETE");
    });
  });
});
