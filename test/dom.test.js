import { describe, it, expect, beforeEach, vi } from "vitest";
import { Q, all, makeId, parseHtml, make, onPageLoad, onWindowLoad, scan } from "../src/dom";

describe("dom.js", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    document.body.innerHTML = `
      <div id="a" class="box">Hello</div>
      <div class="box">World</div>
      <input id="inp" value="abc" />
      <select id="sel" multiple>
        <option value="1" selected>One</option>
        <option value="2">Two</option>
        <option value="3" selected>Three</option>
      </select>
    `;
  });

  it("Q() wraps a selected element and can read/write text()", () => {
    expect(Q("#a").text()).toBe("Hello");

    Q("#a").text("Changed");
    expect(Q("#a").text()).toBe("Changed");
  });

  it("Q().html() reads/writes innerHTML", () => {
    Q("#a").html("<span>Hi</span>");
    expect(Q("#a").html()).toBe("<span>Hi</span>");
  });

  it("all() returns NodeList of matching elements", () => {
    const nodes = all(".box");
    expect(nodes.length).toBe(2);
    expect(nodes[0].textContent).toContain("Hello");
  });

  it("Q().val() reads input value", () => {
    expect(Q("#inp").val()).toBe("abc");
  });

  it("Q().val() reads multi-select values", () => {
    expect(Q("#sel").val()).toEqual(["1", "3"]);
  });

  it("make() creates an element", () => {
    const el = make("button");
    el.id = "btn";
    el.textContent = "Click";
    document.body.appendChild(el);

    expect(document.querySelector("#btn")?.textContent).toBe("Click");
  });

  it("makeId() returns a string of requested length", () => {
    const id = makeId(12);
    expect(id).toHaveLength(12);
    // basic sanity: alphanumeric
    expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
  });

  it("parseHtml() parses markup into nodes", () => {
    const nodes = parseHtml("<div id='x'></div><span>y</span>");
    expect(nodes.length).toBe(2);
    expect(nodes[0].nodeName).toBe("DIV");
    expect(nodes[1].nodeName).toBe("SPAN");
  });

  it("onPageLoad() calls immediately when document is not loading", () => {
    const cb = vi.fn();
    // In jsdom, readyState is usually "complete" or "interactive"
    onPageLoad(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("onWindowLoad() assigns callback to window.onload", () => {
    const cb = vi.fn();
    onWindowLoad(cb);
    expect(window.onload).toBe(cb);
  });

  describe("Q() - class manipulation", () => {
    it("addClass() adds a class to the element", () => {
      Q("#a").addClass("active");
      expect(document.querySelector("#a").classList.contains("active")).toBe(true);
    });

    it("addClass() is chainable", () => {
      const w = Q("#a");
      expect(w.addClass("x")).toBe(w);
    });

    it("removeClass() removes a class from the element", () => {
      document.querySelector("#a").classList.add("active");
      Q("#a").removeClass("active");
      expect(document.querySelector("#a").classList.contains("active")).toBe(false);
    });

    it("removeClass() is chainable", () => {
      const w = Q("#a");
      expect(w.removeClass("x")).toBe(w);
    });

    it("hasClass() returns true when element has the class", () => {
      document.querySelector("#a").classList.add("box");
      expect(Q("#a").hasClass("box")).toBe(true);
    });

    it("hasClass() returns false when element does not have the class", () => {
      expect(Q("#a").hasClass("nope")).toBe(false);
    });
  });

  describe("Q() - visibility", () => {
    it("hide() sets display to none", () => {
      Q("#a").hide();
      expect(document.querySelector("#a").style.display).toBe("none");
    });

    it("hide() is chainable", () => {
      const w = Q("#a");
      expect(w.hide()).toBe(w);
    });

    it("show() clears the display style", () => {
      document.querySelector("#a").style.display = "none";
      Q("#a").show();
      expect(document.querySelector("#a").style.display).toBe("");
    });

    it("show() is chainable", () => {
      const w = Q("#a");
      expect(w.show()).toBe(w);
    });

    it("toggle() hides a visible element", () => {
      Q("#a").toggle();
      expect(document.querySelector("#a").style.display).toBe("none");
    });

    it("toggle() shows a hidden element", () => {
      document.querySelector("#a").style.display = "none";
      Q("#a").toggle();
      expect(document.querySelector("#a").style.display).toBe("");
    });

    it("toggle() is chainable", () => {
      const w = Q("#a");
      expect(w.toggle()).toBe(w);
    });
  });

  describe("Q() - styles, props, attrs", () => {
    it("css() applies a style object to the element", () => {
      Q("#a").css({ color: "red", fontWeight: "bold" });
      const el = document.querySelector("#a");
      expect(el.style.color).toBe("red");
      expect(el.style.fontWeight).toBe("bold");
    });

    it("css() is chainable", () => {
      const w = Q("#a");
      expect(w.css({ color: "blue" })).toBe(w);
    });

    it("prop() reads a property from the element", () => {
      expect(Q("#inp").prop("tagName")).toBe("INPUT");
    });

    it("attr() reads an attribute from the element", () => {
      document.querySelector("#a").setAttribute("data-id", "99");
      expect(Q("#a").attr("data-id")).toBe("99");
    });

    it("removeAttr() removes an attribute from the element", () => {
      document.querySelector("#a").setAttribute("data-foo", "bar");
      Q("#a").removeAttr("data-foo");
      expect(document.querySelector("#a").getAttribute("data-foo")).toBeNull();
    });
  });

  describe("Q() - events", () => {
    it("on() registers an event listener", () => {
      const handler = vi.fn();
      Q("#a").on("click", handler);
      document.querySelector("#a").click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("off() removes an event listener", () => {
      const handler = vi.fn();
      const el = document.querySelector("#a");
      Q("#a").on("click", handler);
      Q("#a").off("click", handler);
      el.click();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Q() - null element safety", () => {
    it("returns undefined for methods when element does not exist", () => {
      expect(Q("#does-not-exist").text()).toBeUndefined();
      expect(Q("#does-not-exist").html()).toBeUndefined();
      expect(Q("#does-not-exist").val()).toBeUndefined();
    });

    it("safe methods return undefined for null element", () => {
      expect(Q("#does-not-exist").prop("id")).toBeUndefined();
      expect(Q("#does-not-exist").attr("class")).toBeUndefined();
      expect(Q("#does-not-exist").hasClass("x")).toBeUndefined();
    });
  });
});

describe("dom.js - scan()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    document.body.innerHTML = `
      <div id="root">
        <button v-ref="save">Save</button>
        <input v-ref="name" value="Pascal" />
        <span v-ref="label">Hello</span>

        <div class="row" v-ref="row">Row 1</div>
        <div class="row" v-ref="row">Row 2</div>
      </div>
    `;
  });

  it("scan() throws if root is not found", () => {
    expect(() => scan("#nope")).toThrow(/Dom\.scan: root "#nope" not found/);
  });

  it("scan() returns a proxy that lets you access refs as properties", () => {
    const refs = scan("#root");

    expect(refs.save.elt.tagName).toBe("BUTTON");
    expect(refs.name.elt.tagName).toBe("INPUT");
    expect(refs.label.text()).toBe("Hello");
  });

  it("scan() supports .get(key) and returns the wrapped element", () => {
    const refs = scan("#root");

    const name = refs.get("name");
    expect(name.elt.id).toBe(""); // no id, just v-ref
    expect(name.val()).toBe("Pascal");
  });

  it("scan() supports .all(key) and always returns an array", () => {
    const refs = scan("#root");

    const rows = refs.all("row");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toBe("Row 1");
    expect(rows[1].text()).toBe("Row 2");

    // single ref -> still array
    const names = refs.all("name");
    expect(names).toHaveLength(1);
    expect(names[0].val()).toBe("Pascal");

    // missing -> empty array
    expect(refs.all("missing")).toEqual([]);
  });

  it("scan() stores multiple refs with same name as an array internally", () => {
    const refs = scan("#root");

    // raw cache via "_"
    const cache = refs._;
    expect(cache).toBeTruthy();
    expect(Array.isArray(cache.row)).toBe(true);
    expect(cache.row).toHaveLength(2);
    expect(cache.row[0].text()).toBe("Row 1");
  });

  it("scan() warns and returns a safe wrapper when a ref is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refs = scan("#root");

    const missing = refs.doesNotExist;

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /DOM\.scan: ref "doesNotExist" not found/,
    );

    // should be a safe Q(null)-style wrapper: methods return undefined, not throw
    expect(missing.elt).toBe(null); // if your Q(null) sets elt to null
    expect(missing.text()).toBeUndefined();
    expect(missing.html()).toBeUndefined();
    expect(missing.val()).toBeUndefined();
  });

  it("scan() supports custom refAttr option", () => {
    document.body.innerHTML = `
      <div id="root">
        <button data-ref="go">Go</button>
      </div>
    `;

    const refs = scan("#root", { refAttr: "data-ref" });
    expect(refs.go.elt.tagName).toBe("BUTTON");
  });

  it("scan() works when rootSelector is a DOM element", () => {
    const rootEl = document.querySelector("#root");
    const refs = scan(rootEl);

    expect(refs.save.elt.tagName).toBe("BUTTON");
    expect(refs.label.text()).toBe("Hello");
  });

  it("scan() .on() attaches event listener to a single ref", () => {
    const refs = scan("#root");
    const handler = vi.fn();

    refs.on("save", "click", handler);
    document.querySelector('[v-ref="save"]').click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("scan() .on() attaches event listener to all refs with the same name", () => {
    const refs = scan("#root");
    const handler = vi.fn();

    refs.on("row", "click", handler);

    document.querySelectorAll('[v-ref="row"]').forEach((el) => el.click());

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
