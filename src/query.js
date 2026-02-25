import EVT from "./evt.js";
import { sleep } from "./utils.js";
import { signal } from "./reactive.js";

export const createQuery = (options = {}) => {
  const {
    persistKey = "query-cache",
    persistedKeys = null,
    defaultTtl = 60000,
    defaultStaleTime = 5000,
    defaultRetries = 3,
    defaultRetryDelay = 1000,
  } = options;

  const cache = new Map();
  const pollingIntervals = new Map();

  // Events
  const emit = (event, key, data) => {
    EVT.pub(`query:${event}`, { key, ...data });
    EVT.pub(`query:${key}:${event}`, data);
  };

  // Persistence
  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(persistKey);
      if (!stored) return;

      const entries = JSON.parse(stored);
      const now = Date.now();

      for (const [key, entry] of Object.entries(entries)) {
        if (now < entry.expiry) {
          cache.set(key, { ...entry, promise: null });
        }
      }
      EVT.pub("query:hydrated", { keys: [...cache.keys()] });
    } catch (e) {
      console.warn("Failed to load query cache: ", e);
    }
  };

  const saveToStorage = () => {
    try {
      const toStore = {};
      for (const [key, entry] of cache.entries()) {
        if (entry.data === undefined) continue;
        if (persistedKeys && !persistedKeys.some((pk) => key.startsWith(pk)))
          continue;

        toStore[key] = {
          data: entry.data,
          staleAt: entry.staleAt,
          expiry: entry.expiry,
        };
      }
      localStorage.setItem(persistKey, JSON.stringify(toStore));
    } catch (e) {
      console.warn("Failed to persist query cache: ", e);
    }
  };

  let persistTimeout = null;
  const schedulePersist = () => {
    if (persistTimeout) clearTimeout(persistTimeout);
    persistTimeout = setTimeout(saveToStorage, 1000);
  };

  // Core
  const getEntry = (key) => cache.get(key) ?? null;

  const fetchWithRetry = async (key, fetcher, retries, retryDelay) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetcher();
      } catch (error) {
        lastError = error;

        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          emit("retry", key, {
            attempt: attempt + 1,
            maxRetries: retries,
            delay,
            error,
          });
          await sleep(delay);
        }
      }
    }
    throw lastError;
  };

  const query = async (key, fetcher, options = {}) => {
    const {
      ttl = defaultTtl,
      staleTime = defaultStaleTime,
      retries = defaultRetries,
      retryDelay = defaultRetryDelay,
    } = options;

    const now = Date.now();
    const entry = getEntry(key);

    if (entry && now < entry.staleAt) {
      emit("hit", key, { data: entry.data });
      return entry.data;
    }

    if (entry?.promise) {
      return entry.promise;
    }

    const isStale = entry && now < entry.expiry;

    emit("fetch", key, { isStale, hasCache: !!entry });

    const promise = fetchWithRetry(key, fetcher, retries, retryDelay)
      .then((data) => {
        cache.set(key, {
          data,
          staleAt: Date.now() + staleTime,
          expiry: Date.now() + ttl,
          promise: null,
          error: null,
        });

        emit("success", key, { data });
        schedulePersist();
        return data;
      })
      .catch((error) => {
        cache.set(key, {
          data: entry?.data ?? null,
          staleAt: entry?.staleAt ?? 0,
          expiry: entry?.expiry ?? 0,
          promise: null,
          error,
        });
        emit("error", key, { error, staleData: entry?.data ?? null });
        throw error;
      });

    cache.set(key, { ...entry, promise });

    if (isStale) return entry.data;

    return promise;
  };

  // Mutations
  const mutate = (key, updater) => {
    const entry = getEntry(key);
    if (!entry) return null;

    const previous = entry.data;
    const next = typeof updater === "function" ? updater(previous) : updater;

    cache.set(key, { ...entry, data: next });
    emit("mutate", key, { data: next, previous });
    schedulePersist();
    return previous;
  };

  const setQueryData = (key, data, options = {}) => {
    const { ttl = defaultTtl, staleTime = defaultStaleTime } = options;
    const now = Date.now();

    cache.set(key, {
      data,
      staleAt: now + staleTime,
      expiry: now + ttl,
      promise: null,
      error: null,
    });
    emit("set", key, { data });
    schedulePersist();
  };

  // Invalidation
  const invalidate = (key, options = {}) => {
    const { refetch: shouldRefetch, fetcher } = options;

    cache.delete(key);
    emit("invalidate", key, {});
    schedulePersist();

    if (shouldRefetch && fetcher) {
      return query(key, fetcher);
    }
  };

  const invalidateMatching = (predicate) => {
    const invalidated = [];
    for (const key of cache.keys()) {
      if (predicate(key)) {
        cache.delete(key);
        invalidated.push(key);
        emit("invalidate", key, {});
      }
    }
    schedulePersist();
    return invalidated;
  };

  // Polling
  const stopPolling = (key) => {
    const intervalId = pollingIntervals.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      pollingIntervals.delete(key);
      emit("polling:stop", key, {});
    }
  };

  const stopAllPolling = () => {
    for (const key of pollingIntervals.keys()) {
      stopPolling(key);
    }
  };

  const startPolling = (key, fetcher, interval, queryOptions = {}) => {
    stopPolling(key);

    query(key, fetcher, queryOptions).catch(() => {});

    const intervalId = setInterval(() => {
      const entry = getEntry(key);
      if (entry) cache.set(key, { ...entry, staleAt: 0 });
      query(key, fetcher, queryOptions).catch(() => {});
    }, interval);

    pollingIntervals.set(key, intervalId);
    emit("polling:start", key, { interval });

    return () => stopPolling(key);
  };

  //Prefetch
  const prefetch = (key, fetcher, options) => {
    const entry = getEntry(key);
    if (entry && Date.now() < entry.staleAt) return;
    query(key, fetcher, options).catch(() => {});
  };

  // GC
  const gc = () => {
    const now = Date.now();
    const collected = [];
    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiry && !EVT.has(`query:${key}:success`)) {
        cache.delete(key);
        collected.push(key);
      }
    }
    if (collected.length) {
      schedulePersist();
      EVT.pub("query:gc", { collected });
    }
  };

  // Subscribe
  const subscribe = (key, callback) => {
    const handler = (data) => callback({ ...getEntry(key), ...data });

    EVT.sub(`query:${key}:success`, handler);
    EVT.sub(`query:${key}:error`, handler);
    EVT.sub(`query:${key}:mutate`, handler);
    EVT.sub(`query:${key}:set`, handler);
    EVT.sub(`query:${key}:invalidate`, () => callback(null));

    // Immediate callback
    const entry = getEntry(key);
    if (entry) callback(entry);

    return () => {
      EVT.unsub(`query:${key}:success`, handler);
      EVT.unsub(`query:${key}:error`, handler);
      EVT.unsub(`query:${key}:mutate`, handler);
      EVT.unsub(`query:${key}:set`, handler);
      EVT.unsub(`query:${key}:invalidate`, handler);
    };
  };

  // Initialize
  loadFromStorage();
  setInterval(gc, 60000);

  window.addEventListener("storage", (e) => {
    if (e.key === persistKey) {
      loadFromStorage();
      for (const key of cache.keys()) {
        emit("sync", key, { data: cache.get(key)?.data });
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    stopAllPolling();
    saveToStorage();
  });

  const querySignal = (key, fetcher, options = {}) => {
    const data = signal(options.inital ?? null);
    const loading = signal(false);
    const error = signal(null);

    const unsubscribe = subscribe(key, (entry) => {
      if (entry?.data) data.val = entry.data;
      if (entry?.error) error.val = entry.error;
      loading.val = !!entry?.promise && !entry?.data;
    });

    const fetch = () => {
      loading.val = true;
      return query(key, fetcher, options);
    };

    const mutateFn = (updater) => {
      const prev = mutate(key, updater);
      data.val = getEntry(key)?.data;
      return prev;
    };

    const refetch = () => {
      invalidate(key);
      return fetch();
    };

    if (options.enabled !== false) fetch().catch(() => {});

    return { data, loading, error, fetch, refetch, unsubscribe, mutate: mutateFn };
  };

  const pollingSignal = (key, fetcher, interval, options = {}) => {
    const qs = querySignal(key, fetcher, { ...options, enabled: false });
    const stop = startPolling(key, fetcher, interval, options);
    return { ...qs, stop };
  };

  const bindQuery = (key, fetcher, options = {}) => {
    const { target, render, onLoading, onError, poll = null, ...queryOptions } =
      options;

    const el =
      typeof target === "string" ? document.querySelector(target) : target;

    const renderData = (data) => {
      const html = render(data);
      if (typeof html === "string") el.innerHTML = html;
    };

    EVT.sub(`query:${key}:success`, ({ data }) => renderData(data));
    EVT.sub(`query:${key}:set`, ({ data }) => renderData(data));
    EVT.sub(`query:${key}:mutate`, ({ data }) => renderData(data));

    if (onError) {
      EVT.sub(`query:${key}:error`, ({ error, staleData }) =>
        onError(error, staleData, el),
      );
    }

    if (onLoading) {
      EVT.sub(`query:${key}:fetch`, ({ hasCache }) => {
        if (!hasCache) onLoading(el);
      });
    }

    query(key, fetcher, queryOptions).catch(() => {});

    if (poll) {
      return startPolling(key, fetcher, poll, queryOptions);
    }
  };

  return {
    query,
    mutate,
    setQueryData,
    invalidate,
    invalidateMatching,
    subscribe,
    prefetch,
    startPolling,
    stopPolling,
    stopAllPolling,
    getEntry,
    gc,
    querySignal,
    pollingSignal,
    bindQuery,
    clear: () => {
      cache.clear();
      localStorage.removeItem(persistKey);
      EVT.pub("query:cleared", {});
    },
  };
};

export const queryClient = createQuery();
