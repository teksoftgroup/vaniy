import { describe, it, expect, beforeEach, vi } from "vitest";
import { Q, all, makeId, parseHtml, make, onPageLoad } from "../src/dom";

describe("dom.js", () => {
  beforeEach(() => {
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
