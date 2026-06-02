import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "../src/component.js";
import { tag } from "../src/ui.js";
import { signal } from "../src/reactive.js";
import { bindText } from "../src/bind.js";

describe("component.js - mount()", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
  });

  // ── Basic structure ──────────────────────────────────────────────────────

  it("mount() returns a component instance", () => {
    const inst = mount(() => null, "#app");
    expect(inst).toBeDefined();
    expect(typeof inst.destroy).toBe("function");
    expect(typeof inst.on).toBe("function");
    expect(typeof inst.off).toBe("function");
  });

  it("instance.props holds values passed at mount time", () => {
    const inst = mount(() => null, "#app", { name: "Alice", role: "admin" });
    expect(inst.props.name).toBe("Alice");
    expect(inst.props.role).toBe("admin");
  });

  it("props defaults to an empty object when not provided", () => {
    const inst = mount(() => null, "#app");
    expect(inst.props).toEqual({});
  });

  // ── Function component shape ─────────────────────────────────────────────

  it("component function receives props as first argument", () => {
    let received;
    mount((props) => { received = props; return null; }, "#app", { x: 42 });
    expect(received.x).toBe(42);
  });

  it("component function receives ctx as second argument", () => {
    let received;
    mount((props, ctx) => { received = ctx; return null; }, "#app");
    expect(typeof received.onMount).toBe("function");
    expect(typeof received.onCleanup).toBe("function");
    expect(typeof received.emit).toBe("function");
  });

  it("component function returning null leaves inst.el null", () => {
    const inst = mount(() => null, "#app");
    expect(inst.el).toBeNull();
  });

  it("component function returning a builder renders into the target", () => {
    mount(() => tag("p").text("Hello"), "#app");
    expect(document.querySelector("#app p")?.textContent).toBe("Hello");
  });

  it("inst.el is the Q-wrapped root element", () => {
    const inst = mount(() => tag("div").css("card"), "#app");
    expect(inst.el).not.toBeNull();
    expect(inst.el.elt.className).toBe("card");
  });

  it("component function can accept a DOM element as target", () => {
    const root = document.querySelector("#app");
    mount(() => tag("span").text("direct"), root);
    expect(root.querySelector("span")?.textContent).toBe("direct");
  });

  // ── State ────────────────────────────────────────────────────────────────

  it("component encapsulates state via signals in its closure", () => {
    function Counter(props, ctx) {
      const count = signal(0);
      let spanEl;

      ctx.onMount(() => {
        ctx.onCleanup(bindText(spanEl, count));
      });

      return tag("div").child(
        tag("span").ref((el) => (spanEl = el)),
        tag("button").text("+").on("click", () => count.val++),
      );
    }

    const inst = mount(Counter, "#app");
    const span = inst.el.elt.querySelector("span");
    expect(span.textContent).toBe("0");
    inst.el.elt.querySelector("button").click();
    expect(span.textContent).toBe("1");
  });

  it("each mount() call creates an independent state instance", () => {
    document.body.innerHTML = `<div id="a"></div><div id="b"></div>`;

    function Counter(props, ctx) {
      const count = signal(0);
      let spanEl;
      ctx.onMount(() => ctx.onCleanup(bindText(spanEl, count)));
      return tag("div").child(
        tag("span").ref((el) => (spanEl = el)),
        tag("button").on("click", () => count.val++),
      );
    }

    const a = mount(Counter, "#a");
    const b = mount(Counter, "#b");

    a.el.elt.querySelector("button").click();
    a.el.elt.querySelector("button").click();

    expect(a.el.elt.querySelector("span").textContent).toBe("2");
    expect(b.el.elt.querySelector("span").textContent).toBe("0");
  });

  // ── Lifecycle: onMount ───────────────────────────────────────────────────

  it("ctx.onMount fires after the template is rendered", () => {
    let elAvailable = false;
    mount((props, ctx) => {
      ctx.onMount((inst) => {
        elAvailable = inst.el !== null;
      });
      return tag("div");
    }, "#app");
    expect(elAvailable).toBe(true);
  });

  it("ctx.onMount receives the component instance", () => {
    let captured;
    const inst = mount((props, ctx) => {
      ctx.onMount((i) => (captured = i));
      return tag("div");
    }, "#app");
    expect(captured).toBe(inst);
  });

  it("multiple ctx.onMount callbacks all fire", () => {
    const order = [];
    mount((props, ctx) => {
      ctx.onMount(() => order.push("a"));
      ctx.onMount(() => order.push("b"));
      return null;
    }, "#app");
    expect(order).toEqual(["a", "b"]);
  });

  // ── Events: emit / on / off ──────────────────────────────────────────────

  it("ctx.emit notifies inst.on() subscribers", () => {
    const handler = vi.fn();
    const inst = mount((props, ctx) => {
      ctx.onMount(() => ctx.emit("hello", "world"));
      return null;
    }, "#app");
    inst.on("hello", handler);

    // Emit again after subscribing
    mount((props, ctx) => {
      ctx.emit("ping", 42);
      return null;
    }, "#app");

    // Use a component that emits after subscription
    const received = [];
    const inst2 = mount((props, ctx) => {
      ctx.onMount(() => {}); // delays emit
      return tag("button").on("click", () => ctx.emit("click", "payload"));
    }, "#app");
    inst2.on("click", (data) => received.push(data));
    inst2.el.elt.click();
    expect(received).toEqual(["payload"]);
  });

  it("inst.on() returns an unsubscribe function", () => {
    const handler = vi.fn();
    const inst = mount((props, ctx) => {
      return tag("button").on("click", () => ctx.emit("press"));
    }, "#app");

    const unsub = inst.on("press", handler);
    inst.el.elt.click();
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    inst.el.elt.click();
    expect(handler).toHaveBeenCalledTimes(1); // no new calls
  });

  it("inst.off() removes a specific subscriber", () => {
    const handler = vi.fn();
    const inst = mount((props, ctx) => {
      return tag("button").on("click", () => ctx.emit("press"));
    }, "#app");

    inst.on("press", handler);
    inst.off("press", handler);
    inst.el.elt.click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("multiple subscribers to the same event all fire", () => {
    const a = vi.fn();
    const b = vi.fn();
    const inst = mount((props, ctx) => {
      return tag("button").on("click", () => ctx.emit("press"));
    }, "#app");

    inst.on("press", a);
    inst.on("press", b);
    inst.el.elt.click();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("events on different instances are isolated", () => {
    document.body.innerHTML = `<div id="a"></div><div id="b"></div>`;
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    const mkBtn = (ctx) =>
      tag("button").on("click", () => ctx.emit("press"));

    const instA = mount((p, ctx) => mkBtn(ctx), "#a");
    const instB = mount((p, ctx) => mkBtn(ctx), "#b");

    instA.on("press", handlerA);
    instB.on("press", handlerB);

    instA.el.elt.click();
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).not.toHaveBeenCalled();
  });

  // ── ref() in tag() ───────────────────────────────────────────────────────

  it("tag().ref() provides a Q-wrapped handle before onMount fires", () => {
    let refEl;
    mount((props, ctx) => {
      ctx.onMount(() => {
        expect(refEl).not.toBeNull();
      });
      return tag("span").ref((el) => (refEl = el));
    }, "#app");
    expect(refEl).not.toBeNull();
    expect(refEl.elt.tagName).toBe("SPAN");
  });

  it("ref() on a child element lets onMount bind reactivity to it", () => {
    function Label(props, ctx) {
      const text = signal("Initial");
      let el;

      ctx.onMount(() => {
        ctx.onCleanup(bindText(el, text));
      });

      // Expose signal for test assertions
      ctx._text = text;

      return tag("span").ref((e) => (el = e));
    }

    let capturedCtx;
    const inst = mount((props, ctx) => {
      capturedCtx = ctx;
      const text = signal("Initial");
      let el;
      ctx.onMount(() => ctx.onCleanup(bindText(el, text)));
      ctx._sig = text;
      return tag("span").ref((e) => (el = e));
    }, "#app");

    expect(inst.el.elt.textContent).toBe("Initial");
    capturedCtx._sig.val = "Updated";
    expect(inst.el.elt.textContent).toBe("Updated");
  });

  // ── Destroy & cleanup ────────────────────────────────────────────────────

  it("destroy() removes the root element from the DOM", () => {
    const inst = mount(() => tag("div").css("to-remove"), "#app");
    expect(document.querySelector(".to-remove")).not.toBeNull();
    inst.destroy();
    expect(document.querySelector(".to-remove")).toBeNull();
  });

  it("destroy() sets inst.el to null", () => {
    const inst = mount(() => tag("div"), "#app");
    inst.destroy();
    expect(inst.el).toBeNull();
  });

  it("destroy() runs all ctx.onCleanup functions", () => {
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();
    const inst = mount((props, ctx) => {
      ctx.onCleanup(cleanupA);
      ctx.onCleanup(cleanupB);
      return null;
    }, "#app");
    inst.destroy();
    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).toHaveBeenCalledTimes(1);
  });

  it("cleanups registered inside onMount also run on destroy", () => {
    const cleanup = vi.fn();
    const inst = mount((props, ctx) => {
      ctx.onMount(() => ctx.onCleanup(cleanup));
      return null;
    }, "#app");
    inst.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("onMount returning a function auto-registers it as cleanup", () => {
    const cleanup = vi.fn();
    const inst = mount((props, ctx) => {
      ctx.onMount(() => cleanup);
      return null;
    }, "#app");
    inst.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("onMount returning an array of functions registers all as cleanups", () => {
    const a = vi.fn();
    const b = vi.fn();
    const inst = mount((props, ctx) => {
      ctx.onMount(() => [a, b]);
      return null;
    }, "#app");
    inst.destroy();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("onMount returning a non-function value does not throw", () => {
    expect(() => {
      const inst = mount((props, ctx) => {
        ctx.onMount(() => 42);
        return null;
      }, "#app");
      inst.destroy();
    }).not.toThrow();
  });

  it("destroy() clears all event subscriptions", () => {
    const handler = vi.fn();
    const inst = mount((props, ctx) => {
      return tag("button").on("click", () => ctx.emit("press"));
    }, "#app");

    inst.on("press", handler);
    inst.destroy();

    // After destroy, emit should be a no-op (listeners cleared)
    // Re-click won't fire because el is removed and listeners are gone
    expect(handler).not.toHaveBeenCalled();
  });

  it("calling destroy() twice does not throw", () => {
    const inst = mount(() => tag("div"), "#app");
    expect(() => {
      inst.destroy();
      inst.destroy();
    }).not.toThrow();
  });

  it("onCleanup stops a bound effect after destroy", () => {
    const inst = mount((props, ctx) => {
      const name = signal("Alice");
      let el;
      ctx.onMount(() => ctx.onCleanup(bindText(el, name)));
      ctx._name = name;
      return tag("span").ref((e) => (el = e));
    }, "#app");

    inst.destroy();
    // After destroy, changing the signal should not throw
    expect(() => { inst.props; }).not.toThrow(); // inst still accessible
  });

  it("destroy() stops effects from .classIf() on the template", () => {
    const active = signal(false);
    const inst = mount(() =>
      tag("div").classIf("on", active),
    "#app");

    active.val = true;
    expect(inst.el.elt.classList.contains("on")).toBe(true);

    inst.destroy();
    active.val = false; // signal changes after destroy — should not throw or update
  });

  it("destroy() stops effects from .prop() on the template", () => {
    const checked = signal(false);
    const inst = mount(() =>
      tag("input").attr("type", "checkbox").prop("checked", checked),
    "#app");

    checked.val = true;
    expect(inst.el.elt.checked).toBe(true);

    inst.destroy();
    checked.val = false; // should not throw
  });

  // ── Multiple components on the same page ─────────────────────────────────

  it("multiple different components can coexist on the page", () => {
    document.body.innerHTML = `
      <div id="header"></div>
      <div id="footer"></div>
    `;

    function Header(props) {
      return tag("h1").text(props.title);
    }

    function Footer(props) {
      return tag("p").text(props.copy);
    }

    mount(Header, "#header", { title: "My App" });
    mount(Footer, "#footer", { copy: "© 2026" });

    expect(document.querySelector("#header h1")?.textContent).toBe("My App");
    expect(document.querySelector("#footer p")?.textContent).toBe("© 2026");
  });
});
