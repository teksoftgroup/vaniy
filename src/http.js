"use strict";

/**
 * Lightweight HTTP utility with:
 * - base URL support
 * - request + response interceptors
 * - timeouts (AbortController for fetch, XHR timeout for uploads)
 * - caching (memory/localStorage/sessionStorage) with TTL
 * - download helper (stream + progress)
 * - upload helper (XHR + progress)
 *
 * Default export: HTTP (chainable config object)
 *
 * Example:
 *   import HTTP from "./http.js";
 *
 *   HTTP
 *     .base("https://api.example.com")
 *     .timeout(10000)
 *     .interceptRequest((cfg) => {
 *       cfg.headers = { ...cfg.headers, Authorization: "Bearer token" };
 *       return cfg;
 *     });
 *
 *   const user = await HTTP.get("/me");
 */

let _base = "";
let _timeout = 8000;
let _requestInterceptor = null;
let _responseInterceptor = null;
let _bearerTokenFn = null;
const _statusHandlers = new Map();

const memoryStore = new Map();
const now = () => Date.now();

function makeStorageAdapter(kind) {
  const store = typeof window !== "undefined" ? window[kind] : null;
  if (!store) return null;
  return {
    get(key) {
      const raw = store.getItem(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.exp && parsed.exp < now()) {
          store.removeItem(key);
          return null;
        }
        return parsed.val;
      } catch {
        return null;
      }
    },
    set(key, val, ttl) {
      const exp = ttl ? now() + ttl : null;
      store.setItem(key, JSON.stringify({ val, exp }));
    },
    del(key) {
      if (store) store.removeItem(key);
    },
    clear() {
      if (store) store.clear();
    },
  };
}

const storages = {
  memory: {
    get(key) {
      const hit = memoryStore.get(key);
      if (!hit) return null;
      if (hit.exp && hit.exp < now()) {
        memoryStore.delete(key);
        return null;
      }
      return hit.val;
    },
    set(key, val, ttl) {
      const exp = ttl ? now() + ttl : null;
      memoryStore.set(key, { val, exp });
    },
    del(key) {
      memoryStore.delete(key);
    },
    clear() {
      memoryStore.clear();
    },
  },
  local: makeStorageAdapter("localStorage"),
  session: makeStorageAdapter("sessionStorage"),
};

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

function getStorage(storageKind = "memory") {
  return storages[storageKind] || storages.memory;
}

function buildCacheKey(method, url, params, body) {
  const p = params ? `?${new URLSearchParams(params).toString()}` : "";
  const b = body && method !== "GET" ? `#${stableStringify(body)}` : "";
  return `H|${method}|${url}${p}${b}`;
}

function buildFormData({ files, fieldName = "file", fields = {} }) {
  const fd = new FormData();

  const list = Array.isArray(files) ? files : [files];
  list.forEach((f, i) => {
    const name = list.length > 1 ? `${fieldName}[${i}]` : fieldName;
    fd.append(name, f);
  });

  Object.entries(fields).forEach(([k, v]) => {
    fd.append(
      k,
      v instanceof Blob || v instanceof File
        ? v
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v),
    );
  });

  return fd;
}

const applyTimeout = (ms, controller) =>
  setTimeout(() => controller.abort(), ms);

/**
 * Core request function used by get/post/put/delete.
 *
 * - Uses fetch() with AbortController timeout
 * - Auto JSON parses if possible; otherwise returns text
 * - Supports caching (memory/local/session) with TTL and strategies
 *
 * @template T
 * @param {"GET"|"POST"|"PUT"|"DELETE"|string} method
 * @param {string} url Relative URL (prefixed by base())
 * @param {RequestOptions} [opts]
 * @returns {Promise<T>}
 * @throws {HttpError} if response is not ok
 *
 * @example
 * const data = await request("GET", "/users", {
 *   params: { page: 1 },
 *   cache: { strategy: "cache-first", ttl: 60_000, storage: "memory" }
 * });
 *
 * @example
 * // network-first with cache fallback
 * const data = await request("GET", "/settings", {
 *   cache: { strategy: "network-first", ttl: 5 * 60_000, storage: "local" }
 * });
 */
export async function request(method, url, opts = {}) {
  const { params, body, headers = {}, cache } = opts;

  let finalUrl = _base + url;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs;
  }

  const controller = new AbortController();
  const timeoutId = applyTimeout(_timeout, controller);
  const useCache = !!cache;
  const strategy = cache?.strategy; // 'cache-first' | 'network-first'
  const ttl = cache?.ttl ?? 0;
  const storage = getStorage(cache?.storage);
  const cacheKey = cache?.key || buildCacheKey(method, finalUrl, params, body);

  if (useCache && !cache?.forceRefresh && strategy === "cache-first") {
    const hit = storage.get(cacheKey);
    if (hit !== null) return hit;
  }

  // Build URL with base + query params

  let config = {
    method,
    headers,
    signal: controller.signal,
  };

  if (_bearerTokenFn) {
    const { token, headerName } = _bearerTokenFn;
    const tokenValue = typeof token === "function" ? token() : token;

    if (tokenValue) {
      const prefix = headerName === "Authorization" ? "Bearer " : "";
      config.headers[headerName] = `${prefix}${tokenValue}`;
    }
  }

  if (body !== undefined) {
    if (body instanceof FormData) {
      config.body = body;
    } else {
      config.headers["Content-Type"] = "application/json";
      config.body = JSON.stringify(body);
    }
  }

  if (_requestInterceptor) {
    config = _requestInterceptor(config) || config;
  }

  try {
    let res = await fetch(finalUrl, config);

    if (_statusHandlers.has(res.status)) {
      _statusHandlers.get(res.status)(res, { method, url: finalUrl });
    }
    
    clearTimeout(timeoutId);

    if (_responseInterceptor) {
      res = _responseInterceptor(res) || res;
    }

    // Try to parse JSON but fallback to text
    let data;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }

    if (!res.ok) {
      const err = {
        status: res.status,
        data,
        url: finalUrl,
        method,
      };
      //for network-first with cache fallback on error, try cached value
      if (useCache && strategy === "network-first") {
        const cached = storage.get(cacheKey);
        if (cached !== null) return cached;
      }
      throw err;
    }

    if (useCache) {
      storage.set(cacheKey, data, ttl);
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (useCache && strategy === "network-first") {
      const cached = storage.get(cacheKey);
      if (cached !== null) return cached;
    }
    throw err;
  }
}

/**
 * Download a file and trigger a browser download prompt.
 * Uses fetch() and can stream progress when ReadableStream is available.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {string} [options.filename]
 *   Optional filename override. If omitted, inferred from Content-Disposition.
 * @param {Object<string,string|number|boolean>} [options.params]
 * @param {Object<string,string>} [options.headers]
 * @param {"GET"|"POST"|"PUT"|"DELETE"|string} [options.method="GET"]
 * @param {any} [options.body]
 * @param {(receivedBytes:number, totalBytes:number|null, percent:number|null)=>void} [options.onProgress]
 *
 * @returns {Promise<{filename:string, size:number, type:string}>}
 *
 * @example
 * await download("/reports/monthly", {
 *   params: { month: "2026-01" },
 *   onProgress: (received, total, percent) => {
 *     console.log("download", { received, total, percent });
 *   }
 * });
 */
export async function download(
  url,
  { filename, params, headers = {}, method = "GET", body, onProgress } = {},
) {
  // Build URL w/ base + params
  let finalUrl = _base + url;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    finalUrl += (finalUrl.includes("?") ? "&" : "?") + qs;
  }

  const controller = new AbortController();
  const timeoutId = applyTimeout(_timeout, controller);

  // Prepare request
  const init = {
    method,
    headers: { ...headers },
    signal: controller.signal,
  };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers["Content-Type"] =
        init.headers["Content-Type"] || "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
  }

  const res = await fetch(finalUrl, init);
  clearTimeout(timeoutId);
  if (!res.ok) {
    let errText = "";
    try {
      errText = await res.text();
    } catch {}
    throw new Error(
      `Download failed ${res.status}: ${errText || res.statusText}`,
    );
  }

  // Try to infer filename from Content-Disposition
  if (!filename) {
    const cd = res.headers.get("Content-Disposition") || "";
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd);
    filename = decodeURIComponent(match?.[1] || match?.[2] || "download");
  }

  // Stream with progress if possible
  let blob;
  if (res.body && "getReader" in res.body) {
    const reader = res.body.getReader();
    const contentLength = Number(res.headers.get("Content-Length")) || null;
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (typeof onProgress === "function") {
        const percent = contentLength
          ? Math.round((received / contentLength) * 100)
          : null;
        onProgress(received, contentLength, percent);
      }
    }
    blob = new Blob(chunks);
  } else {
    blob = await res.blob();
    if (typeof onProgress === "function") onProgress(1, 1, 100);
  }

  // Trigger browser download
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);

  return { filename, size: blob.size, type: blob.type };
}

/**
 * Upload one or more files with progress using XMLHttpRequest.
 * (XHR is used because fetch upload progress is not consistently available.)
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {File|Blob|Array<File|Blob>} options.files
 * @param {string} [options.fieldName="file"]
 * @param {Object<string, any>} [options.fields={}]
 * @param {Object<string,string>} [options.headers={}]
 *   Extra headers (do NOT set Content-Type for FormData yourself)
 * @param {"POST"|"PUT"|string} [options.method="POST"]
 * @param {(sentBytes:number, totalBytes:number|null, percent:number|null)=>void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 *
 * @returns {Promise<any>}
 *
 * @example
 * const ac = new AbortController();
 * const result = await upload("/upload", {
 *   files: fileInput.files[0],
 *   fields: { userId: 123 },
 *   onProgress: (sent, total, percent) => console.log({ sent, total, percent }),
 *   signal: ac.signal
 * });
 */
export function upload(
  url,
  {
    files, // File | Blob | File[] | Blob[]
    fieldName = "file", // form field name(s)
    fields = {}, // additional form fields (e.g., { name: "Pascal" })
    headers = {}, // extra headers (don't set Content-Type yourself)
    method = "POST",
    onProgress, // (sentBytes, totalBytes, percent) => void
    signal, // AbortSignal
  } = {},
) {
  return new Promise((resolve, reject) => {
    const fd = buildFormData({ files, fieldName, fields });

    // Build URL with base
    const finalUrl = `${_base}${url}`;

    // Use XHR for upload progress
    const xhr = new XMLHttpRequest();
    xhr.open(method, finalUrl, true);

    let cfg = { method, headers: { ...headers } };

    if (_bearerTokenFn) {
      const { token, headerName } = _bearerTokenFn;
      const tokenValue = typeof token === "function" ? token() : token;

      if (tokenValue) {
        const prefix = headerName === "Authorization" ? "Bearer " : "";
        cfg.headers[headerName] = `${prefix}${tokenValue}`;
      }
    }

    // apply interceptors (request)

    if (_requestInterceptor) {
      cfg = _requestInterceptor(cfg) || cfg;
    }

    // set headers AFTER interceptor (never set Content-Type for FormData manually)
    Object.entries(cfg.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    // timeout (ms)
    xhr.timeout = _timeout;

    // abort support
    if (signal) {
      const onAbort = () => {
        try {
          xhr.abort();
        } catch {}
      };
      if (signal.aborted) onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    // progress
    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) {
          onProgress(e.loaded, null, null);
          return;
        }
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(e.loaded, e.total, percent);
      };
    }

    xhr.onreadystatechange = async () => {
      if (xhr.readyState !== 4) return;

      // apply interceptor (response-like)
      if (_responseInterceptor) {
        // minimal fake Response compatible object
        const fakeRes = {
          status: xhr.status,
          ok: xhr.status >= 200 && xhr.status < 300,
          headers: new Headers(), // not fully accurate; fine for logging/hook
          text: async () => xhr.responseText,
          json: async () => JSON.parse(xhr.responseText || "null"),
        };
        _responseInterceptor(fakeRes);
      }

      // parse JSON or text
      const contentType = xhr.getResponseHeader("Content-Type") || "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? safeJson(xhr.responseText) : xhr.responseText;

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
      } else {
        reject({
          status: xhr.status,
          data: payload,
          url: finalUrl,
          method,
        });
      }
    };

    xhr.onerror = () =>
      reject({
        status: 0,
        data: "Network error",
        url: `${_base}${url}`,
        method,
      });
    xhr.ontimeout = () =>
      reject({
        status: 0,
        data: "Timeout",
        url: `${_base}${url}`,
        method,
      });

    xhr.send(fd);
  });

  function safeJson(t) {
    try {
      return JSON.parse(t || "null");
    } catch {
      return t;
    }
  }
}

/**
 * Convenience methods:
 * - get(url, opts)
 * - post(url, body, opts)
 * - put(url, body, opts)
 * - delete(url, opts)
 */
export const get = (url, opts) => request("GET", url, opts);
export const post = (url, body, opts = {}) =>
  request("POST", url, { ...opts, body });
export const put = (url, body, opts = {}) =>
  request("PUT", url, { ...opts, body });
export const del = (url, opts = {}) => request("DELETE", url, opts);
export const raw = (url, opts) => fetch(_base + url, opts);

const HTTP = {
  /**
   * Set base URL prefix for all requests.
   * @param {string} url
   * @returns {typeof HTTP}
   */
  base(url) {
    _base = url;
    return HTTP;
  },
  /**
   * Set default timeout for requests (ms).
   * - fetch requests abort via AbortController
   * - XHR uploads use xhr.timeout
   * @param {number} ms
   * @returns {typeof HTTP}
   */
  timeout(ms) {
    _timeout = ms;
    return HTTP;
  },
  /**
   * Set bearer token for all requests.
   * @param {string|(() => string|null)} token - Token string or getter function
   * @param {string} [headerName="Authorization"] - Header name
   * @returns {typeof HTTP}
   *
   * @example
   * // Static token
   * HTTP.bearer("my-token");
   *
   * // From localStorage (re-reads on each request)
   * HTTP.bearer(() => localStorage.getItem("auth_token"));
   *
   * // Custom header name
   * HTTP.bearer(() => localStorage.getItem("api_key"), "X-API-Key");
   */
  bearer(token, headerName = "Authorization") {
    _bearerTokenFn = { token, headerName };
    return HTTP;
  },
  onStatus(status, fn) {
    _statusHandlers.set(status, fn);
    return HTTP;
  },
  onUnauthorized(fn) {
    return HTTP.onStatus(401, fn);
  },
  onForbidden(fn) {
    return HTTP.onStatus(403, fn);
  },
  onInternalServerError(fn) {
    return HTTP.onStatus(500, fn);
  },
  /**
   * Request interceptor hook.
   * Useful for auth headers, correlation IDs, etc.
   * @param {RequestInterceptor} fn
   * @returns {typeof HTTP}
   *
   * @example
   * HTTP.interceptRequest((cfg) => {
   *   cfg.headers = { ...cfg.headers, Authorization: `Bearer ${token}` };
   *   return cfg;
   * });
   */
  interceptRequest(fn) {
    _requestInterceptor = fn;
    return HTTP;
  },
  /**
   * Response interceptor hook.
   * Useful for logging, auto-logout on 401, etc.
   * @param {ResponseInterceptor} fn
   * @returns {typeof HTTP}
   */

  interceptResponse(fn) {
    _responseInterceptor = fn;
    return HTTP;
  },

  get,
  post,
  put,
  delete: del,
  raw,
  download,
  upload,
  ping: () => console.log("PONG"),
  description: "H is for Http",
};

export default HTTP;
