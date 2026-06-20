"use strict";

/**
 * Lightweight WebSocket utility with:
 * - auto-reconnect with exponential backoff
 * - session id (auto-generated or server-assigned, persisted across reloads)
 * - rooms (join/leave, auto-rejoined after reconnect)
 * - pub/sub style event dispatch (on/off/once), scoped to a room if needed
 * - request/response (RPC) pattern with timeout
 * - heartbeat (liveness ping) to detect dead connections
 * - outgoing queue while offline, flushed on (re)connect
 * - send/message interceptors
 *
 * Wire protocol (JSON envelopes, all optional - raw text/binary frames still
 * surface via the "message" event):
 *   { type: "event",   event, payload, room? }
 *   { type: "request", event, payload, id, room? }   -> client to server
 *   { type: "response", id, payload, error? }         -> server to client
 *   { type: "session", id }                            -> server to client
 *   { type: "join"|"leave", room }                     -> client to server
 *
 * Default export: WS (a ready-to-use singleton socket, lazily connected)
 * Named export: createSocket(url, options) for independent connections
 *
 * @example
 *   import WS from "./ws.js";
 *
 *   WS.connect("wss://api.example.com/socket")
 *     .onOpen(() => console.log("connected, session:", WS.session()))
 *     .join("room-1")
 *     .on("chat", (msg) => console.log("chat:", msg), { room: "room-1" });
 *
 *   WS.emit("chat", { text: "hi" }, { room: "room-1" });
 *   const ack = await WS.request("whoami");
 *
 * @example
 *   import { createSocket } from "./ws.js";
 *   const notifications = createSocket("wss://api.example.com/notifications");
 */

/**
 * Create an independent WebSocket connection with session/room support.
 *
 * @param {string} [url] Optional - connects immediately if provided (unless autoConnect: false)
 * @param {Object} [options]
 * @param {string|string[]} [options.protocols]
 * @param {boolean} [options.autoConnect=true]
 * @param {boolean} [options.reconnect=true]
 * @param {number} [options.reconnectDelay=1000] Base delay (ms), doubles each attempt
 * @param {number} [options.maxReconnectDelay=30000]
 * @param {number} [options.maxReconnectAttempts=Infinity]
 * @param {{interval:number, message?:any, timeout?:number}} [options.heartbeat]
 * @param {string|(() => string)} [options.session] Explicit session id (or getter)
 * @param {"local"|"session"|false} [options.sessionStorage="session"]
 * @param {string} [options.sessionKey="vaniy_ws_session"]
 * @param {number} [options.requestTimeout=8000]
 * @param {boolean} [options.queueWhileOffline=true]
 * @param {number} [options.maxQueueSize=100]
 * @returns {Object} socket instance
 */
export function createSocket(url, options = {}) {
  const config = {
    protocols: options.protocols,
    autoConnect: options.autoConnect !== false,
    reconnect: options.reconnect !== false,
    reconnectDelay: options.reconnectDelay ?? 1000,
    maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
    maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
    heartbeat: options.heartbeat ?? null,
    session: options.session,
    sessionStorage:
      options.sessionStorage === undefined ? "session" : options.sessionStorage,
    sessionKey: options.sessionKey ?? "vaniy_ws_session",
    requestTimeout: options.requestTimeout ?? 8000,
    queueWhileOffline: options.queueWhileOffline !== false,
    maxQueueSize: options.maxQueueSize ?? 100,
  };

  let currentUrl = url;
  let socket = null;
  let state = "closed"; // "connecting" | "open" | "closing" | "closed"
  let manuallyClosed = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let heartbeatTimeoutTimer = null;
  let sendInterceptor = null;
  let messageInterceptor = null;
  let sessionId = null;
  let requestSeq = 0;

  const listeners = new Map(); // event -> Set<handler>
  const pendingRequests = new Map(); // id -> { resolve, reject, timer }
  const joinedRooms = new Set();
  const outgoingQueue = [];

  let instance;

  function safeStorage(kind) {
    try {
      return typeof window !== "undefined" ? window[kind] : null;
    } catch {
      return null;
    }
  }

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function loadOrCreateSessionId() {
    if (typeof config.session === "string") return config.session;
    if (typeof config.session === "function") return config.session();
    if (config.sessionStorage) {
      const store = safeStorage(
        config.sessionStorage === "local" ? "localStorage" : "sessionStorage",
      );
      const existing = store?.getItem(config.sessionKey);
      if (existing) return existing;
    }
    return generateId();
  }

  function persistSession(id) {
    if (!config.sessionStorage) return;
    const store = safeStorage(
      config.sessionStorage === "local" ? "localStorage" : "sessionStorage",
    );
    store?.setItem(config.sessionKey, id);
  }

  function setSessionId(id) {
    sessionId = id;
    persistSession(id);
    emitLocal("session", id);
  }

  function buildUrl() {
    if (!sessionId) return currentUrl;
    const sep = currentUrl.includes("?") ? "&" : "?";
    return `${currentUrl}${sep}session=${encodeURIComponent(sessionId)}`;
  }

  // --- pub/sub -------------------------------------------------------------

  function on(event, fn, { room } = {}) {
    const handler = room
      ? (payload, msg) => {
          if (msg && msg.room === room) fn(payload, msg);
        }
      : fn;
    handler._orig = fn;

    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(handler);
    return () => off(event, fn);
  }

  function off(event, fn) {
    const set = listeners.get(event);
    if (!set) return;
    for (const h of set) {
      if (h === fn || h._orig === fn) set.delete(h);
    }
  }

  function once(event, fn, opts) {
    const wrapped = (...args) => {
      off(event, wrapped);
      fn(...args);
    };
    return on(event, wrapped, opts);
  }

  function emitLocal(event, ...args) {
    const set = listeners.get(event);
    if (!set) return;
    [...set].forEach((fn) => {
      try {
        fn(...args);
      } catch (e) {
        console.error(`Error in ws "${event}" listener: `, e);
      }
    });
  }

  // --- outgoing --------------------------------------------------------------

  function rawSend(data) {
    if (state !== "open") {
      if (config.queueWhileOffline) {
        if (outgoingQueue.length >= config.maxQueueSize) outgoingQueue.shift();
        outgoingQueue.push(data);
      }
      return false;
    }
    socket.send(data);
    return true;
  }

  function flushQueue() {
    if (!outgoingQueue.length) return;
    outgoingQueue.splice(0).forEach(rawSend);
  }

  function send(data) {
    let payload = data;
    if (
      typeof payload !== "string" &&
      !(payload instanceof Blob) &&
      !(payload instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(payload)
    ) {
      payload = JSON.stringify(payload);
    }
    if (sendInterceptor) payload = sendInterceptor(payload) ?? payload;
    return rawSend(payload);
  }

  function emit(event, payload, { room } = {}) {
    return send({ type: "event", event, payload, ...(room ? { room } : {}) });
  }

  function request(event, payload, { room, timeout = config.requestTimeout } = {}) {
    return new Promise((resolve, reject) => {
      const id = ++requestSeq;
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(
          Object.assign(new Error(`ws request "${event}" timed out`), {
            timeout: true,
            event,
            id,
          }),
        );
      }, timeout);

      pendingRequests.set(id, { resolve, reject, timer });

      const sent = send({
        type: "request",
        event,
        payload,
        id,
        ...(room ? { room } : {}),
      });

      if (!sent && !config.queueWhileOffline) {
        clearTimeout(timer);
        pendingRequests.delete(id);
        reject(
          Object.assign(new Error(`ws request "${event}" failed: socket not open`), {
            offline: true,
            event,
            id,
          }),
        );
      }
    });
  }

  function resolveRequest(msg) {
    const pending = pendingRequests.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(msg.id);
    if (msg.error) pending.reject(msg.error);
    else pending.resolve(msg.payload);
  }

  function rejectAllPending(reason) {
    pendingRequests.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(reason);
    });
    pendingRequests.clear();
  }

  // --- rooms -----------------------------------------------------------------

  function join(room) {
    joinedRooms.add(room);
    send({ type: "join", room });
    return instance;
  }

  function leave(room) {
    joinedRooms.delete(room);
    send({ type: "leave", room });
    return instance;
  }

  function rejoinRooms() {
    joinedRooms.forEach((room) => send({ type: "join", room }));
  }

  // --- incoming ----------------------------------------------------------------

  function handleMessage(e) {
    if (heartbeatTimeoutTimer) clearTimeout(heartbeatTimeoutTimer);

    let parsed = e.data;
    let isStructured = false;

    if (typeof e.data === "string") {
      try {
        const json = JSON.parse(e.data);
        if (json && typeof json === "object") {
          parsed = json;
          isStructured = true;
        }
      } catch {
        // not JSON - leave parsed as the raw string
      }
    }

    if (messageInterceptor) {
      const result = messageInterceptor(parsed, e);
      if (result !== undefined) parsed = result;
    }

    emitLocal("message", parsed, e);

    if (!isStructured) return;

    if (parsed.type === "session" && parsed.id) {
      setSessionId(parsed.id);
      return;
    }

    if (parsed.type === "response") {
      resolveRequest(parsed);
      return;
    }

    if (parsed.event) {
      emitLocal(parsed.event, parsed.payload, parsed);
    }
  }

  // --- heartbeat -----------------------------------------------------------------

  function startHeartbeatTimer() {
    stopHeartbeatTimer();
    if (!config.heartbeat) return;
    const { interval, message = "ping", timeout = interval } = config.heartbeat;
    heartbeatTimer = setInterval(() => {
      send(typeof message === "function" ? message() : message);
      heartbeatTimeoutTimer = setTimeout(() => socket?.close(), timeout);
    }, interval);
  }

  function stopHeartbeatTimer() {
    clearInterval(heartbeatTimer);
    clearTimeout(heartbeatTimeoutTimer);
  }

  function heartbeat(interval, opts = {}) {
    config.heartbeat = interval ? { interval, ...opts } : null;
    if (state === "open") startHeartbeatTimer();
    return instance;
  }

  // --- connection lifecycle ------------------------------------------------------

  function teardown() {
    if (!socket) return;
    const old = socket;
    socket = null;
    old.onopen = null;
    old.onmessage = null;
    old.onclose = null;
    old.onerror = null;
    try {
      old.close();
    } catch {
      // already closed/closing
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= config.maxReconnectAttempts) {
      emitLocal("reconnect_failed");
      return;
    }
    const delay = Math.min(
      config.reconnectDelay * 2 ** reconnectAttempts,
      config.maxReconnectDelay,
    );
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      emitLocal("reconnect", reconnectAttempts);
      open();
    }, delay);
  }

  function open() {
    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket is not supported in this environment");
    }
    if (!currentUrl) throw new Error("ws: connect() requires a url");

    teardown();
    clearTimeout(reconnectTimer);
    state = "connecting";
    if (!sessionId) {
      sessionId = loadOrCreateSessionId();
      persistSession(sessionId);
    }

    socket = config.protocols
      ? new WebSocket(buildUrl(), config.protocols)
      : new WebSocket(buildUrl());

    socket.onopen = (e) => {
      state = "open";
      reconnectAttempts = 0;
      rejoinRooms();
      flushQueue();
      startHeartbeatTimer();
      emitLocal("open", e);
    };
    socket.onmessage = handleMessage;
    socket.onclose = (e) => {
      state = "closed";
      stopHeartbeatTimer();
      rejectAllPending(
        Object.assign(new Error("ws connection closed"), { closed: true }),
      );
      emitLocal("close", e);
      if (!manuallyClosed && config.reconnect) scheduleReconnect();
    };
    socket.onerror = (e) => emitLocal("error", e);
  }

  function connect(newUrl, overrides) {
    if (newUrl) currentUrl = newUrl;
    if (overrides) Object.assign(config, overrides);
    manuallyClosed = false;
    reconnectAttempts = 0;
    open();
    return instance;
  }

  function disconnect(code, reason) {
    manuallyClosed = true;
    clearTimeout(reconnectTimer);
    stopHeartbeatTimer();
    state = "closing";
    socket?.close(code, reason);
    return instance;
  }

  function interceptSend(fn) {
    sendInterceptor = fn;
    return instance;
  }

  function interceptMessage(fn) {
    messageInterceptor = fn;
    return instance;
  }

  const onOpen = (fn) => (on("open", fn), instance);
  const onClose = (fn) => (on("close", fn), instance);
  const onError = (fn) => (on("error", fn), instance);
  const onReconnect = (fn) => (on("reconnect", fn), instance);

  const getState = () => state;
  const isOpen = () => state === "open";

  instance = {
    connect,
    disconnect,
    send,
    emit,
    request,
    join,
    leave,
    rooms: () => [...joinedRooms],
    session: () => sessionId,
    on,
    off,
    once,
    onOpen,
    onClose,
    onError,
    onReconnect,
    interceptSend,
    interceptMessage,
    heartbeat,
    getState,
    isOpen,
    url: () => currentUrl,
    raw: () => socket,
    ping: () => console.log("PONG"),
    description: "WS is for WebSocket session/room messaging",
  };

  if (currentUrl && config.autoConnect) connect(currentUrl);

  return instance;
}

/**
 * Default singleton socket. Not connected until `.connect(url)` is called,
 * so handlers (onOpen/on/...) can be registered beforehand.
 */
const WS = createSocket();

export default WS;
