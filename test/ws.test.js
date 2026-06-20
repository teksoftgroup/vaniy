import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import WS, { createSocket } from "../src/ws.js";

class MockWebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close(code, reason) {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  triggerMessage(data) {
    this.onmessage?.({
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
  }

  triggerError(e = {}) {
    this.onerror?.(e);
  }

  static latest() {
    return MockWebSocket.instances.at(-1);
  }
}
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;
MockWebSocket.instances = [];

describe("ws.js", () => {
  const created = [];

  function makeSocket(url = "wss://example.com/socket", opts = {}) {
    const s = createSocket(url, opts);
    created.push(s);
    return s;
  }

  beforeEach(() => {
    MockWebSocket.instances = [];
    global.WebSocket = MockWebSocket;
    vi.useFakeTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    created.forEach((s) => {
      try {
        s.disconnect();
      } catch {}
    });
    created.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("createSocket() returns an instance with the expected API", () => {
    const s = makeSocket(null, { autoConnect: false });
    expect(typeof s.connect).toBe("function");
    expect(typeof s.disconnect).toBe("function");
    expect(typeof s.send).toBe("function");
    expect(typeof s.emit).toBe("function");
    expect(typeof s.request).toBe("function");
    expect(typeof s.join).toBe("function");
    expect(typeof s.leave).toBe("function");
    expect(typeof s.session).toBe("function");
    expect(s.getState()).toBe("closed");
  });

  it("connect() opens a WebSocket against the given url and protocols", () => {
    const s = makeSocket(null, { autoConnect: false, sessionStorage: false });
    s.connect("wss://example.com/socket", { protocols: "v1" });

    const ws = MockWebSocket.latest();
    expect(ws.url).toMatch(/^wss:\/\/example\.com\/socket\?session=/);
    expect(ws.protocols).toBe("v1");
    expect(s.getState()).toBe("connecting");
  });

  it("getState()/isOpen() reflect the connection lifecycle", () => {
    const s = makeSocket();
    expect(s.getState()).toBe("connecting");
    expect(s.isOpen()).toBe(false);

    MockWebSocket.latest().triggerOpen();
    expect(s.getState()).toBe("open");
    expect(s.isOpen()).toBe(true);

    MockWebSocket.latest().close();
    expect(s.getState()).toBe("closed");
    expect(s.isOpen()).toBe(false);
  });

  describe("send()", () => {
    it("JSON-stringifies plain objects but passes strings through as-is", () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      s.send({ a: 1 });
      s.send("raw-string");

      const ws = MockWebSocket.latest();
      expect(ws.sent[0]).toBe(JSON.stringify({ a: 1 }));
      expect(ws.sent[1]).toBe("raw-string");
    });

    it("queues outgoing sends while not open and flushes them once open", () => {
      const s = makeSocket();
      const ws = MockWebSocket.latest();

      const ok = s.send({ hello: "world" });
      expect(ok).toBe(false);
      expect(ws.sent.length).toBe(0);

      ws.triggerOpen();
      expect(ws.sent).toContain(JSON.stringify({ hello: "world" }));
    });

    it("drops the oldest queued message once maxQueueSize is exceeded", () => {
      const s = makeSocket(null, { autoConnect: false, maxQueueSize: 2 });
      s.connect("wss://example.com/socket");

      s.send("a");
      s.send("b");
      s.send("c");

      MockWebSocket.latest().triggerOpen();
      const ws = MockWebSocket.latest();
      expect(ws.sent).toEqual(["b", "c"]);
    });
  });

  describe("events: on/off/once", () => {
    it("dispatches structured {type:'event'} messages to matching listeners", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.on("chat", handler);

      MockWebSocket.latest().triggerMessage({
        type: "event",
        event: "chat",
        payload: { text: "hi" },
      });

      expect(handler).toHaveBeenCalledWith({ text: "hi" }, expect.objectContaining({ event: "chat" }));
    });

    it("emit() sends a {type:'event'} envelope, optionally scoped to a room", () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      s.emit("chat", { text: "hi" }, { room: "room-1" });

      const ws = MockWebSocket.latest();
      expect(ws.sent[0]).toBe(
        JSON.stringify({ type: "event", event: "chat", payload: { text: "hi" }, room: "room-1" }),
      );
    });

    it("off() stops a previously registered listener", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.on("chat", handler);
      s.off("chat", handler);

      MockWebSocket.latest().triggerMessage({ type: "event", event: "chat", payload: 1 });
      expect(handler).not.toHaveBeenCalled();
    });

    it("once() fires only for the first matching message", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.once("chat", handler);

      const ws = MockWebSocket.latest();
      ws.triggerMessage({ type: "event", event: "chat", payload: 1 });
      ws.triggerMessage({ type: "event", event: "chat", payload: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(1, expect.anything());
    });

    it("on(event, fn, { room }) only fires for messages tagged with that room", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.on("chat", handler, { room: "room-1" });

      const ws = MockWebSocket.latest();
      ws.triggerMessage({ type: "event", event: "chat", payload: "x", room: "room-2" });
      expect(handler).not.toHaveBeenCalled();

      ws.triggerMessage({ type: "event", event: "chat", payload: "y", room: "room-1" });
      expect(handler).toHaveBeenCalledWith("y", expect.objectContaining({ room: "room-1" }));
    });

    it("'message' listeners receive every inbound frame, JSON or raw text", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.on("message", handler);

      const ws = MockWebSocket.latest();
      ws.triggerMessage("plain text");
      ws.triggerMessage({ type: "event", event: "x", payload: 1 });

      expect(handler).toHaveBeenCalledWith("plain text", expect.anything());
      expect(handler).toHaveBeenCalledWith(
        { type: "event", event: "x", payload: 1 },
        expect.anything(),
      );
    });
  });

  describe("rooms", () => {
    it("join()/leave() send envelopes and track joined rooms", () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      s.join("room-1");
      expect(s.rooms()).toEqual(["room-1"]);

      s.leave("room-1");
      expect(s.rooms()).toEqual([]);

      const ws = MockWebSocket.latest();
      expect(ws.sent).toContain(JSON.stringify({ type: "join", room: "room-1" }));
      expect(ws.sent).toContain(JSON.stringify({ type: "leave", room: "room-1" }));
    });

    it("automatically rejoins rooms after a reconnect", async () => {
      const s = makeSocket(null, {
        autoConnect: false,
        reconnectDelay: 10,
        maxReconnectDelay: 100,
      });
      s.connect("wss://example.com/socket");
      MockWebSocket.latest().triggerOpen();
      s.join("room-1");

      MockWebSocket.latest().close(); // simulate dropped connection
      await vi.advanceTimersByTimeAsync(10);

      const newWs = MockWebSocket.latest();
      newWs.triggerOpen();

      expect(newWs.sent).toContain(JSON.stringify({ type: "join", room: "room-1" }));
    });
  });

  describe("session", () => {
    it("auto-generates and persists a session id to sessionStorage by default", () => {
      const s = makeSocket();
      const id = s.session();
      expect(typeof id).toBe("string");
      expect(window.sessionStorage.getItem("vaniy_ws_session")).toBe(id);
    });

    it("reuses a session id already present in storage", () => {
      window.sessionStorage.setItem("vaniy_ws_session", "existing-id");
      const s = makeSocket();
      expect(s.session()).toBe("existing-id");
    });

    it("honors an explicit session id (string or function)", () => {
      const s1 = makeSocket("wss://example.com/a", { session: "fixed-id" });
      expect(s1.session()).toBe("fixed-id");

      const s2 = makeSocket("wss://example.com/b", { session: () => "from-fn" });
      expect(s2.session()).toBe("from-fn");
    });

    it("does not touch storage when sessionStorage: false", () => {
      makeSocket(null, { autoConnect: false, sessionStorage: false }).connect(
        "wss://example.com/socket",
      );
      expect(window.sessionStorage.getItem("vaniy_ws_session")).toBeNull();
    });

    it("updates and persists the session id from a server {type:'session'} message", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.on("session", handler);

      MockWebSocket.latest().triggerMessage({ type: "session", id: "server-id" });

      expect(s.session()).toBe("server-id");
      expect(window.sessionStorage.getItem("vaniy_ws_session")).toBe("server-id");
      expect(handler).toHaveBeenCalledWith("server-id");
    });
  });

  describe("request()/response RPC", () => {
    it("resolves when a matching {type:'response'} message arrives", async () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      const p = s.request("whoami");
      const ws = MockWebSocket.latest();
      const sentMsg = JSON.parse(ws.sent.at(-1));
      expect(sentMsg).toMatchObject({ type: "request", event: "whoami" });

      ws.triggerMessage({ type: "response", id: sentMsg.id, payload: { name: "pascal" } });

      await expect(p).resolves.toEqual({ name: "pascal" });
    });

    it("rejects when the response carries an error", async () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      const p = s.request("boom");
      const ws = MockWebSocket.latest();
      const sentMsg = JSON.parse(ws.sent.at(-1));

      ws.triggerMessage({ type: "response", id: sentMsg.id, error: "nope" });

      await expect(p).rejects.toBe("nope");
    });

    it("rejects after the timeout elapses with no response", async () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      const p = s.request("slow", null, { timeout: 100 });
      const assertion = expect(p).rejects.toMatchObject({ timeout: true, event: "slow" });
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    });

    it("rejects immediately when offline and queueWhileOffline is false", async () => {
      const s = makeSocket(null, { autoConnect: false, queueWhileOffline: false });
      s.connect("wss://example.com/socket"); // never opened

      await expect(s.request("ping")).rejects.toMatchObject({ offline: true });
    });

    it("rejects pending requests when the connection closes", async () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      const p = s.request("whoami");
      MockWebSocket.latest().close();

      await expect(p).rejects.toMatchObject({ closed: true });
    });
  });

  describe("reconnect", () => {
    it("schedules reconnect attempts with exponential backoff", async () => {
      const s = makeSocket(null, {
        autoConnect: false,
        reconnectDelay: 10,
        maxReconnectDelay: 1000,
      });
      s.connect("wss://example.com/socket");
      MockWebSocket.latest().triggerOpen();

      MockWebSocket.latest().close();
      expect(MockWebSocket.instances.length).toBe(1);
      await vi.advanceTimersByTimeAsync(10); // 10 * 2^0
      expect(MockWebSocket.instances.length).toBe(2);

      MockWebSocket.latest().close();
      await vi.advanceTimersByTimeAsync(20); // 10 * 2^1
      expect(MockWebSocket.instances.length).toBe(3);
    });

    it("stops reconnecting and emits 'reconnect_failed' after maxReconnectAttempts", async () => {
      const s = makeSocket(null, {
        autoConnect: false,
        reconnectDelay: 10,
        maxReconnectAttempts: 1,
      });
      const failed = vi.fn();
      s.on("reconnect_failed", failed);

      s.connect("wss://example.com/socket");
      MockWebSocket.latest().close(); // attempt 1 scheduled
      await vi.advanceTimersByTimeAsync(10);
      expect(MockWebSocket.instances.length).toBe(2);

      MockWebSocket.latest().close(); // attempts exhausted
      await vi.advanceTimersByTimeAsync(1000);
      expect(MockWebSocket.instances.length).toBe(2);
      expect(failed).toHaveBeenCalledTimes(1);
    });

    it("does not auto-reconnect after a manual disconnect()", async () => {
      const s = makeSocket(null, { autoConnect: false, reconnectDelay: 10 });
      s.connect("wss://example.com/socket");
      MockWebSocket.latest().triggerOpen();

      s.disconnect();
      await vi.advanceTimersByTimeAsync(1000);

      expect(MockWebSocket.instances.length).toBe(1);
      // the mock closes synchronously, so the "closing" state is already settled
      expect(s.getState()).toBe("closed");
    });
  });

  describe("heartbeat", () => {
    it("sends a heartbeat message on the configured interval", () => {
      const s = makeSocket(null, {
        autoConnect: false,
        reconnect: false,
        heartbeat: { interval: 1000 },
      });
      s.connect("wss://example.com/socket");
      MockWebSocket.latest().triggerOpen();

      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.latest().sent).toContain("ping");
    });

    it("closes the socket if no message arrives within the heartbeat timeout", async () => {
      const s = makeSocket(null, {
        autoConnect: false,
        reconnect: false,
        heartbeat: { interval: 1000, timeout: 500 },
      });
      s.connect("wss://example.com/socket");
      MockWebSocket.latest().triggerOpen();

      await vi.advanceTimersByTimeAsync(1500); // interval + timeout
      expect(s.getState()).toBe("closed");
    });

    it("any inbound message resets the heartbeat timeout", async () => {
      const s = makeSocket(null, {
        autoConnect: false,
        reconnect: false,
        heartbeat: { interval: 1000, timeout: 500 },
      });
      s.connect("wss://example.com/socket");
      const ws = MockWebSocket.latest();
      ws.triggerOpen();

      await vi.advanceTimersByTimeAsync(1000); // heartbeat sent, timeout armed
      ws.triggerMessage("anything"); // resets the timeout
      await vi.advanceTimersByTimeAsync(500);

      expect(s.getState()).toBe("open");
    });
  });

  describe("interceptors", () => {
    it("interceptSend() can rewrite outgoing payloads", () => {
      const s = makeSocket();
      MockWebSocket.latest().triggerOpen();

      s.interceptSend((payload) => payload.toUpperCase());
      s.send("hello");

      expect(MockWebSocket.latest().sent.at(-1)).toBe("HELLO");
    });

    it("interceptMessage() can rewrite incoming payloads before dispatch", () => {
      const s = makeSocket();
      const handler = vi.fn();
      s.on("x", handler);

      s.interceptMessage((parsed) => ({
        ...parsed,
        payload: { ...parsed.payload, tagged: true },
      }));

      MockWebSocket.latest().triggerMessage({ type: "event", event: "x", payload: { a: 1 } });

      expect(handler).toHaveBeenCalledWith({ a: 1, tagged: true }, expect.anything());
    });
  });

  describe("lifecycle sugar", () => {
    it("onOpen/onClose/onError fire and are chainable", () => {
      const s = makeSocket(null, { autoConnect: false });
      const openFn = vi.fn();
      const closeFn = vi.fn();
      const errorFn = vi.fn();

      expect(s.onOpen(openFn)).toBe(s);
      expect(s.onClose(closeFn)).toBe(s);
      expect(s.onError(errorFn)).toBe(s);

      s.connect("wss://example.com/socket");
      const ws = MockWebSocket.latest();
      ws.triggerOpen();
      ws.triggerError(new Error("boom"));
      ws.close();

      expect(openFn).toHaveBeenCalledTimes(1);
      expect(errorFn).toHaveBeenCalledTimes(1);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("default singleton WS", () => {
    it("is a ready-to-use socket instance, connect() is chainable", () => {
      expect(WS.getState()).toBe("closed");
      expect(WS.connect("wss://example.com/socket")).toBe(WS);
      created.push(WS);
    });
  });
});
