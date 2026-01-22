import { describe, it, expect, beforeEach, vi } from "vitest";
import { Q, all, makeId, parseHtml, make, onPageLoad, scan } from "../src/dom";

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
});
