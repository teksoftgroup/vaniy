import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import EVT from "../src/evt.js";

describe("evt.js (EVT)", () => {
  beforeEach(() => {
    // Ensure clean state between tests
    EVT.clear();
  });

  it("exports expected shape", () => {
    expect(EVT).toHaveProperty("listeners");
    expect(EVT).toHaveProperty("sub");
    expect(EVT).toHaveProperty("once");
    expect(EVT).toHaveProperty("unsub");
    expect(EVT).toHaveProperty("pub");
    expect(EVT).toHaveProperty("has");
    expect(EVT).toHaveProperty("clear");
    expect(EVT).toHaveProperty("ping");
    expect(EVT).toHaveProperty("description");
    expect(typeof EVT.description).toBe("string");
  });

  it("sub() registers a listener and pub() calls it with args", () => {
    const cb = vi.fn();

    EVT.sub("hello", cb);
    EVT.pub("hello", 1, "a", { ok: true });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1, "a", { ok: true });
  });

  it("pub() does nothing when no listeners exist", () => {
    const cb = vi.fn();

    // no subscription
    EVT.pub("nope", 123);

    expect(cb).toHaveBeenCalledTimes(0);
  });

  it("unsub() removes a specific listener", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    EVT.sub("e", cb1);
    EVT.sub("e", cb2);

    EVT.unsub("e", cb1);

    EVT.pub("e", "x");

    expect(cb1).toHaveBeenCalledTimes(0);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledWith("x");
  });

  it("unsub() is safe when event name does not exist", () => {
    expect(() => EVT.unsub("missing", () => {})).not.toThrow();
  });

  it("sub() dedupes the same callback (Set behavior)", () => {
    const cb = vi.fn();

    EVT.sub("d", cb);
    EVT.sub("d", cb);
    EVT.sub("d", cb);

    EVT.pub("d");

    // Should only be called once because Set dedupes
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("once() calls the handler only once even if published multiple times", () => {
    const cb = vi.fn();

    EVT.once("onceEvent", cb);

    EVT.pub("onceEvent", 1);
    EVT.pub("onceEvent", 2);
    EVT.pub("onceEvent", 3);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(1);
  });

  it("has() returns true when an event has at least one listener", () => {
    expect(EVT.has("h")).toBe(false);

    const cb = vi.fn();
    EVT.sub("h", cb);

    expect(EVT.has("h")).toBe(true);
  });

  it("has() returns false after unsub removes last listener", () => {
    const cb = vi.fn();
    EVT.sub("z", cb);

    expect(EVT.has("z")).toBe(true);

    EVT.unsub("z", cb);

    expect(EVT.has("z")).toBe(false);
  });

  it("clear(name) removes only that event's listeners", () => {
    const a = vi.fn();
    const b = vi.fn();

    EVT.sub("a", a);
    EVT.sub("b", b);

    EVT.clear("a");

    EVT.pub("a");
    EVT.pub("b");

    expect(a).toHaveBeenCalledTimes(0);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("clear() with no args clears all listeners", () => {
    const a = vi.fn();
    const b = vi.fn();

    EVT.sub("a", a);
    EVT.sub("b", b);

    EVT.clear();

    EVT.pub("a");
    EVT.pub("b");

    expect(a).toHaveBeenCalledTimes(0);
    expect(b).toHaveBeenCalledTimes(0);
    expect(EVT.has("a")).toBe(false);
    expect(EVT.has("b")).toBe(false);
  });

  it("pub() continues calling other listeners even if one throws, and logs error", () => {
    const erring = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    EVT.sub("x", erring);
    EVT.sub("x", ok);

    EVT.pub("x", 42);

    expect(erring).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledWith(42);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('Error in event "x" listener:');

    spy.mockRestore();
  });

  it("ping() logs PONG!", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    EVT.ping();
    expect(spy).toHaveBeenCalledWith("PONG!");
    spy.mockRestore();
  });
});
