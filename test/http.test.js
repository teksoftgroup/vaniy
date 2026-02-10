import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import HTTP, { request } from "../src/http.js";

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
    
    // reset module config
    HTTP.base("").timeout(8000).interceptRequest(null).interceptResponse(null);
    
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
});
