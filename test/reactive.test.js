import { describe, it, expect, vi } from "vitest";
import { signal, effect, computed, batch, when } from "../src/reactive.js";

describe("reactive.js", () => {
  describe("signal()", () => {
    it("holds the initial value", () => {
      const s = signal(42);
      expect(s.val).toBe(42);
    });

    it("can be updated via .val setter", () => {
      const s = signal(1);
      s.val = 2;
      expect(s.val).toBe(2);
    });

    it("notifies subscribers when value changes", () => {
      const s = signal(0);
      const cb = vi.fn();
      s.subscribe(cb);
      s.val = 1;
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("does not notify subscribers when same value is set", () => {
      const s = signal("x");
      const cb = vi.fn();
      s.subscribe(cb);
      s.val = "x";
      expect(cb).not.toHaveBeenCalled();
    });

    it("peek() returns value without tracking", () => {
      const s = signal(10);
      expect(s.peek()).toBe(10);
    });

    it("subscribe() returns an unsubscribe function", () => {
      const s = signal(0);
      const cb = vi.fn();
      const unsub = s.subscribe(cb);
      unsub();
      s.val = 99;
      expect(cb).not.toHaveBeenCalled();
    });

    it("multiple independent subscribers are all notified", () => {
      const s = signal("a");
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      s.subscribe(cb1);
      s.subscribe(cb2);
      s.val = "b";
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it("toString() returns string form of value", () => {
      const s = signal(99);
      expect(s.toString()).toBe("99");
    });

    it("valueOf() returns the raw value", () => {
      const s = signal(5);
      expect(s.valueOf()).toBe(5);
    });

    it("works with object values", () => {
      const s = signal({ a: 1 });
      const next = { a: 2 };
      s.val = next;
      expect(s.val).toBe(next);
    });
  });

  describe("effect()", () => {
    it("runs immediately on creation", () => {
      const fn = vi.fn();
      effect(fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("re-runs when a tracked signal changes", () => {
      const s = signal("a");
      const fn = vi.fn(() => s.val);
      effect(fn);
      s.val = "b";
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does not re-run when an untracked signal changes", () => {
      const a = signal(1);
      const b = signal(2);
      const fn = vi.fn(() => a.val); // only tracks a
      effect(fn);
      b.val = 99;
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("returns the runner function", () => {
      const run = effect(() => {});
      expect(typeof run).toBe("function");
    });

    it("can be triggered manually via the returned runner", () => {
      const fn = vi.fn();
      const run = effect(fn);
      run();
      expect(fn).toHaveBeenCalledTimes(2); // initial + manual
    });

    it("tracks multiple signals used in one effect", () => {
      const a = signal(1);
      const b = signal(2);
      const fn = vi.fn(() => a.val + b.val);
      effect(fn);
      fn.mockClear();
      a.val = 10;
      expect(fn).toHaveBeenCalledTimes(1);
      b.val = 20;
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("computed()", () => {
    it("derives a value from a signal", () => {
      const s = signal(5);
      const doubled = computed(() => s.val * 2);
      expect(doubled.val).toBe(10);
    });

    it("updates when its dependency changes", () => {
      const a = signal(2);
      const b = signal(3);
      const sum = computed(() => a.val + b.val);
      expect(sum.val).toBe(5);
      a.val = 10;
      expect(sum.val).toBe(13);
    });

    it("is readable via .val like a regular signal", () => {
      const s = signal("hello");
      const upper = computed(() => s.val.toUpperCase());
      expect(upper.val).toBe("HELLO");
    });

    it("chains: computed depending on another computed", () => {
      const s = signal(3);
      const squared = computed(() => s.val * s.val);
      const squaredPlusOne = computed(() => squared.val + 1);
      expect(squaredPlusOne.val).toBe(10);
      s.val = 4;
      expect(squaredPlusOne.val).toBe(17);
    });
  });

  describe("batch()", () => {
    it("executes the provided function", () => {
      const fn = vi.fn();
      batch(fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("all signal mutations inside batch are applied", () => {
      const a = signal(0);
      const b = signal(0);
      batch(() => {
        a.val = 1;
        b.val = 2;
      });
      expect(a.val).toBe(1);
      expect(b.val).toBe(2);
    });
  });

  describe("when()", () => {
    it("calls fn immediately when signal starts truthy", () => {
      const s = signal("hello");
      const fn = vi.fn();
      when(s, fn);
      expect(fn).toHaveBeenCalledWith("hello");
    });

    it("does not call fn when signal is initially falsy", () => {
      const s = signal(false);
      const fn = vi.fn();
      when(s, fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("calls fn when signal transitions from falsy to truthy", () => {
      const s = signal(null);
      const fn = vi.fn();
      when(s, fn);
      s.val = "active";
      expect(fn).toHaveBeenCalledWith("active");
    });

    it("does not call fn when signal remains falsy", () => {
      const s = signal(null);
      const fn = vi.fn();
      when(s, fn);
      s.val = 0;
      s.val = "";
      expect(fn).not.toHaveBeenCalled();
    });

    it("calls fn on each truthy update", () => {
      const s = signal(1);
      const fn = vi.fn();
      when(s, fn);
      fn.mockClear();
      s.val = 2;
      s.val = 3;
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
