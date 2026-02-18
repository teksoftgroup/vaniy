import { describe, it, expect, vi, beforeEach } from "vitest";
import { definePage, mountPage } from "../src/page.js";

describe("page.js", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="root">
        <button v-ref="save">Save</button>
        <input v-ref="name" value="Test" />
        <span v-ref="label">Hello</span>
      </div>
    `;
  });

  describe("definePage()", () => {
    it("returns an object with init and destroy methods", () => {
      const page = definePage({ root: "#root" });
      expect(typeof page.init).toBe("function");
      expect(typeof page.destroy).toBe("function");
    });

    it("refs is null before init()", () => {
      const page = definePage({ root: "#root" });
      expect(page.refs).toBeNull();
    });

    it("init() calls scan() and populates refs", () => {
      const page = definePage({ root: "#root" });
      page.init();
      expect(page.refs).not.toBeNull();
      expect(page.refs.save.elt.tagName).toBe("BUTTON");
      expect(page.refs.name.elt.tagName).toBe("INPUT");
    });

    it("init() calls setup lifecycle hook", () => {
      const setup = vi.fn();
      const page = definePage({ root: "#root", setup });
      page.init();
      expect(setup).toHaveBeenCalledTimes(1);
    });

    it("init() calls bindings lifecycle hook", () => {
      const bindings = vi.fn();
      const page = definePage({ root: "#root", bindings });
      page.init();
      expect(bindings).toHaveBeenCalledTimes(1);
    });

    it("init() calls events lifecycle hook", () => {
      const events = vi.fn();
      const page = definePage({ root: "#root", events });
      page.init();
      expect(events).toHaveBeenCalledTimes(1);
    });

    it("init() calls onReady lifecycle hook", () => {
      const onReady = vi.fn();
      const page = definePage({ root: "#root", onReady });
      page.init();
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    it("init() calls lifecycle hooks in order: setup → bindings → events → onReady", () => {
      const order = [];
      const page = definePage({
        root: "#root",
        setup() { order.push("setup"); },
        bindings() { order.push("bindings"); },
        events() { order.push("events"); },
        onReady() { order.push("onReady"); },
      });
      page.init();
      expect(order).toEqual(["setup", "bindings", "events", "onReady"]);
    });

    it("lifecycle hooks receive the page object as `this`", () => {
      let capturedThis;
      const page = definePage({
        root: "#root",
        setup() { capturedThis = this; },
      });
      page.init();
      expect(capturedThis).toBe(page);
    });

    it("destroy() calls the cleanup hook", () => {
      const cleanup = vi.fn();
      const page = definePage({ root: "#root", cleanup });
      page.destroy();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it("cleanup receives the page object as `this`", () => {
      let capturedThis;
      const page = definePage({
        root: "#root",
        cleanup() { capturedThis = this; },
      });
      page.destroy();
      expect(capturedThis).toBe(page);
    });

    it("does not throw when optional lifecycle hooks are omitted", () => {
      const page = definePage({ root: "#root" });
      expect(() => page.init()).not.toThrow();
      expect(() => page.destroy()).not.toThrow();
    });

    it("spreads config.methods onto the page object", () => {
      const greet = vi.fn(() => "hello");
      const page = definePage({
        root: "#root",
        methods: { greet },
      });
      expect(typeof page.greet).toBe("function");
      expect(page.greet()).toBe("hello");
    });

    it("methods can access page instance via `this` if bound", () => {
      const page = definePage({
        root: "#root",
        methods: {
          getRoot() { return this.refs; },
        },
      });
      page.init();
      // refs is set after init, method can access it via `this`
      expect(page.getRoot()).not.toBeNull();
    });
  });

  describe("mountPage()", () => {
    it("calls page.init() because document is already loaded in jsdom", () => {
      const page = { init: vi.fn(), destroy: vi.fn() };
      mountPage(page);
      expect(page.init).toHaveBeenCalledTimes(1);
    });

    it("returns the page object", () => {
      const page = { init: vi.fn(), destroy: vi.fn() };
      const result = mountPage(page);
      expect(result).toBe(page);
    });

    it("works with a real definePage result", () => {
      const onReady = vi.fn();
      const page = definePage({ root: "#root", onReady });
      mountPage(page);
      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });
});
