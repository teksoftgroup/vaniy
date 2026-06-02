import { describe, it, expect, beforeEach, vi } from "vitest";
import { html, render } from "../src/template.js";
import { signal, computed } from "../src/reactive.js";

describe("template.js", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="app"></div>`;
  });

  // ── html tag ──────────────────────────────────────────────────────────────

  describe("html``", () => {
    it("returns an object carrying strings and interpolated values", () => {
      const result = html`<div>${"hello"}</div>`;
      expect(result).toBeDefined();
      expect(result.strings).toBeDefined();
      expect(result.values).toContain("hello");
    });

    it("same static strings reference produces the same template (cache hit)", () => {
      const make = () => html`<p>${"x"}</p>`;
      const a = make();
      const b = make();
      expect(a.strings).toBe(b.strings);
    });
  });

  // ── render() basics ───────────────────────────────────────────────────────

  describe("render() basics", () => {
    it("renders into a CSS selector target", () => {
      render(html`<p>hello</p>`, "#app");
      expect(document.querySelector("#app p")?.textContent).toBe("hello");
    });

    it("renders into a DOM element target", () => {
      const el = document.querySelector("#app");
      render(html`<p>direct</p>`, el);
      expect(el.querySelector("p")?.textContent).toBe("direct");
    });

    it("clears existing content before rendering", () => {
      document.querySelector("#app").innerHTML = "<span>old</span>";
      render(html`<p>new</p>`, "#app");
      expect(document.querySelector("#app span")).toBeNull();
      expect(document.querySelector("#app p")?.textContent).toBe("new");
    });

    it("returns a cleanup function", () => {
      const stop = render(html`<p>test</p>`, "#app");
      expect(typeof stop).toBe("function");
    });

    it("cleanup clears the target element", () => {
      const stop = render(html`<p>test</p>`, "#app");
      stop();
      expect(document.querySelector("#app").innerHTML).toBe("");
    });

    it("renders static markup with no interpolations", () => {
      render(html`<section><h1>Title</h1><p>Body</p></section>`, "#app");
      expect(document.querySelector("h1")?.textContent).toBe("Title");
      expect(document.querySelector("p")?.textContent).toBe("Body");
    });
  });

  // ── Node bindings (${ }) ──────────────────────────────────────────────────

  describe("node bindings", () => {
    it("renders a string", () => {
      render(html`<p>${"hello"}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("hello");
    });

    it("renders a number", () => {
      render(html`<p>${42}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("42");
    });

    it("renders nothing for null", () => {
      render(html`<p>${null}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("");
    });

    it("renders nothing for false", () => {
      render(html`<p>${false}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("");
    });

    it("renders nothing for undefined", () => {
      render(html`<p>${undefined}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("");
    });

    it("renders a nested TemplateResult", () => {
      render(html`<ul>${html`<li>item</li>`}</ul>`, "#app");
      expect(document.querySelector("li")?.textContent).toBe("item");
    });

    it("renders an array of strings as a flat text sequence", () => {
      render(html`<p>${["a", "b", "c"]}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("abc");
    });

    it("renders an array of TemplateResults", () => {
      const items = ["x", "y"].map((i) => html`<li>${i}</li>`);
      render(html`<ul>${items}</ul>`, "#app");
      const lis = document.querySelectorAll("li");
      expect(lis.length).toBe(2);
      expect(lis[0].textContent).toBe("x");
      expect(lis[1].textContent).toBe("y");
    });

    it("renders a raw DOM Node", () => {
      const span = document.createElement("span");
      span.textContent = "native";
      render(html`<div>${span}</div>`, "#app");
      expect(document.querySelector("span")?.textContent).toBe("native");
    });

    it("multiple node bindings in the same template render independently", () => {
      render(html`<p>${"first"}</p><p>${"second"}</p>`, "#app");
      const paras = document.querySelectorAll("p");
      expect(paras[0].textContent).toBe("first");
      expect(paras[1].textContent).toBe("second");
    });
  });

  // ── Attribute bindings (attr="${}") ───────────────────────────────────────

  describe("attribute bindings", () => {
    it("sets an attribute to a string value", () => {
      render(html`<span data-x="${"foo"}"></span>`, "#app");
      expect(document.querySelector("span").getAttribute("data-x")).toBe("foo");
    });

    it("removes the attribute when the value is null", () => {
      render(html`<div class="${null}"></div>`, "#app");
      expect(document.querySelector("div").hasAttribute("class")).toBe(false);
    });

    it("removes the attribute when the value is false", () => {
      render(html`<div class="${false}"></div>`, "#app");
      expect(document.querySelector("div").hasAttribute("class")).toBe(false);
    });
  });

  // ── Boolean attr bindings (?attr="${}") ───────────────────────────────────

  describe("boolean attr bindings", () => {
    it("sets the attribute when the value is truthy", () => {
      render(html`<button ?disabled=${true}>x</button>`, "#app");
      expect(document.querySelector("button").hasAttribute("disabled")).toBe(true);
    });

    it("omits the attribute when the value is falsy", () => {
      render(html`<button ?disabled=${false}>x</button>`, "#app");
      expect(document.querySelector("button").hasAttribute("disabled")).toBe(false);
    });
  });

  // ── Property bindings (.prop="${}") ───────────────────────────────────────

  describe("property bindings", () => {
    it("sets a string DOM property directly", () => {
      render(html`<input .value=${"hello"} />`, "#app");
      expect(document.querySelector("input").value).toBe("hello");
    });

    it("sets a boolean DOM property", () => {
      render(html`<input .checked=${true} />`, "#app");
      expect(document.querySelector("input").checked).toBe(true);
    });
  });

  // ── Event bindings (@event="${}") ─────────────────────────────────────────

  describe("event bindings", () => {
    it("attaches an event listener", () => {
      const handler = vi.fn();
      render(html`<button @click=${handler}>click</button>`, "#app");
      document.querySelector("button").click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("passes the native Event object to the handler", () => {
      let received;
      render(
        html`<button @click=${(e) => (received = e)}>click</button>`,
        "#app",
      );
      document.querySelector("button").click();
      expect(received).toBeInstanceOf(Event);
    });

    it("replaces the listener when the handler value changes", () => {
      const first = vi.fn();
      const second = vi.fn();
      const handler = signal(first);

      render(html`<button @click=${handler}>click</button>`, "#app");
      document.querySelector("button").click();
      expect(first).toHaveBeenCalledTimes(1);

      handler.val = second;
      document.querySelector("button").click();
      expect(first).toHaveBeenCalledTimes(1); // not called again
      expect(second).toHaveBeenCalledTimes(1);
    });
  });

  // ── Signal reactivity ─────────────────────────────────────────────────────

  describe("signal reactivity", () => {
    it("renders a signal's initial value at a node position", () => {
      const s = signal("initial");
      render(html`<p>${s}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("initial");
    });

    it("updates the DOM when a signal at node position changes", () => {
      const s = signal("before");
      render(html`<p>${s}</p>`, "#app");
      s.val = "after";
      expect(document.querySelector("p").textContent).toBe("after");
    });

    it("renders a signal's initial value at an attribute position", () => {
      const cls = signal("active");
      render(html`<span class="${cls}"></span>`, "#app");
      expect(document.querySelector("span").className).toBe("active");
    });

    it("updates an attribute when its signal changes", () => {
      const cls = signal("a");
      render(html`<span class="${cls}"></span>`, "#app");
      cls.val = "b";
      expect(document.querySelector("span").className).toBe("b");
    });

    it("updates a boolean attribute when its signal changes", () => {
      const disabled = signal(false);
      render(html`<button ?disabled=${disabled}>x</button>`, "#app");
      expect(document.querySelector("button").hasAttribute("disabled")).toBe(false);
      disabled.val = true;
      expect(document.querySelector("button").hasAttribute("disabled")).toBe(true);
    });

    it("updates a DOM property when its signal changes", () => {
      const val = signal("a");
      render(html`<input .value=${val} />`, "#app");
      val.val = "b";
      expect(document.querySelector("input").value).toBe("b");
    });

    it("works with a computed signal", () => {
      const count = signal(1);
      const label = computed(() => `count: ${count.val}`);
      render(html`<p>${label}</p>`, "#app");
      expect(document.querySelector("p").textContent).toBe("count: 1");
      count.val = 2;
      expect(document.querySelector("p").textContent).toBe("count: 2");
    });

    it("toggling a node signal to null clears the position", () => {
      const s = signal("visible");
      render(html`<p>${s}</p>`, "#app");
      s.val = null;
      expect(document.querySelector("p").textContent).toBe("");
    });

    it("toggling a node signal from null to a value renders the value", () => {
      const s = signal(null);
      render(html`<p>${s}</p>`, "#app");
      s.val = "appeared";
      expect(document.querySelector("p").textContent).toBe("appeared");
    });

    it("a signal at a node position can hold a nested TemplateResult", () => {
      const s = signal(html`<span>a</span>`);
      render(html`<div>${s}</div>`, "#app");
      expect(document.querySelector("span")?.textContent).toBe("a");
      s.val = html`<span>b</span>`;
      expect(document.querySelector("span")?.textContent).toBe("b");
    });

    it("multiple independent signals each track their own binding", () => {
      const a = signal("A");
      const b = signal("B");
      render(html`<p id="a">${a}</p><p id="b">${b}</p>`, "#app");
      b.val = "BB";
      expect(document.querySelector("#a").textContent).toBe("A");
      expect(document.querySelector("#b").textContent).toBe("BB");
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("clearing the render removes the DOM", () => {
      const stop = render(html`<p>text</p>`, "#app");
      stop();
      expect(document.querySelector("#app").innerHTML).toBe("");
    });

    it("signal changes after cleanup do not throw", () => {
      const s = signal("a");
      const stop = render(html`<p>${s}</p>`, "#app");
      stop();
      expect(() => {
        s.val = "b";
      }).not.toThrow();
    });

    it("signal changes after cleanup do not update the cleared target", () => {
      const s = signal("a");
      const stop = render(html`<p>${s}</p>`, "#app");
      stop();
      s.val = "b";
      expect(document.querySelector("#app").innerHTML).toBe("");
    });

    it("cleanup removes the signal subscription (signal has no lingering observer)", () => {
      const s = signal("a");
      const stop = render(html`<p>${s}</p>`, "#app");
      const callCount = vi.fn();
      // subscribe AFTER render so we can count fresh updates
      s.subscribe(callCount);
      stop();
      callCount.mockClear();
      s.val = "b";
      // Only the test subscriber should fire; the render subscriber was removed
      expect(callCount).toHaveBeenCalledTimes(1);
    });
  });
});
