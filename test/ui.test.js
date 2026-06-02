import { describe, it, expect, beforeEach, vi } from "vitest";
import { tag, createPresets } from "../src/ui.js";
import { signal } from "../src/reactive.js";

describe("ui.js - tag()", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="root"></div>`;
  });

  it("render() returns a Q-wrapped element with the correct tag", () => {
    const el = tag("div").render();
    expect(el.elt.tagName).toBe("DIV");
  });

  it("text() sets textContent", () => {
    const el = tag("p").text("Hello").render();
    expect(el.elt.textContent).toBe("Hello");
  });

  it("html() sets innerHTML", () => {
    const el = tag("div").html("<span>Hi</span>").render();
    expect(el.elt.innerHTML).toBe("<span>Hi</span>");
  });

  it("css() sets class attribute", () => {
    const el = tag("div").css("foo bar").render();
    expect(el.elt.className).toBe("foo bar");
  });

  it("attr() sets arbitrary attribute", () => {
    const el = tag("input").attr("type", "email").render();
    expect(el.elt.getAttribute("type")).toBe("email");
  });

  it("data() sets a data-* attribute", () => {
    const el = tag("div").data("id", "42").render();
    expect(el.elt.getAttribute("data-id")).toBe("42");
  });

  it("on() attaches an event listener", () => {
    const handler = vi.fn();
    const el = tag("button").on("click", handler).render();
    el.elt.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("child() appends a builder child", () => {
    const parent = tag("div").child(tag("span").text("child")).render();
    expect(parent.elt.querySelector("span")?.textContent).toBe("child");
  });

  it("child() accepts multiple children", () => {
    const parent = tag("ul")
      .child(tag("li").text("a"), tag("li").text("b"))
      .render();
    const items = parent.elt.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe("a");
    expect(items[1].textContent).toBe("b");
  });

  it("child() skips null/undefined children", () => {
    const parent = tag("div").child(null, undefined, tag("span").text("ok")).render();
    expect(parent.elt.querySelectorAll("span").length).toBe(1);
  });

  it("render(target) appends element to the target by selector", () => {
    tag("p").text("mounted").render("#root");
    expect(document.querySelector("#root p")?.textContent).toBe("mounted");
  });

  it("render(target) accepts a DOM element as target", () => {
    const root = document.querySelector("#root");
    tag("span").text("direct").render(root);
    expect(root.querySelector("span")?.textContent).toBe("direct");
  });

  it("methods are chainable", () => {
    const s = signal(false);
    const builder = tag("div");
    expect(builder.text("x")).toBe(builder);
    expect(builder.html("<b></b>")).toBe(builder);
    expect(builder.css("a")).toBe(builder);
    expect(builder.attr("id", "x")).toBe(builder);
    expect(builder.data("k", "v")).toBe(builder);
    expect(builder.on("click", () => {})).toBe(builder);
    expect(builder.child(tag("span"))).toBe(builder);
    expect(builder.classIf("x", s)).toBe(builder);
    expect(builder.prop("hidden", s)).toBe(builder);
  });

  describe("when()", () => {
    it("when(true) returns the builder and renders normally", () => {
      const el = tag("div").text("visible").when(true).render();
      expect(el.elt.textContent).toBe("visible");
    });

    it("when(false) returns a noop and render() returns null", () => {
      const result = tag("div").text("hidden").when(false).render();
      expect(result).toBeNull();
    });

    it("noop builder chains without throwing", () => {
      expect(() => {
        tag("div")
          .when(false)
          .text("x")
          .html("<b></b>")
          .css("c")
          .attr("k", "v")
          .data("k", "v")
          .on("click", () => {})
          .child(tag("span"))
          .when(false)
          .render();
      }).not.toThrow();
    });
  });

  describe("classIf()", () => {
    it("adds the class when signal is truthy", () => {
      const active = signal(true);
      const el = tag("div").classIf("active", active).render();
      expect(el.elt.classList.contains("active")).toBe(true);
    });

    it("does not add the class when signal is falsy", () => {
      const active = signal(false);
      const el = tag("div").classIf("active", active).render();
      expect(el.elt.classList.contains("active")).toBe(false);
    });

    it("toggles the class when signal changes", () => {
      const active = signal(false);
      const el = tag("div").classIf("active", active).render();
      active.val = true;
      expect(el.elt.classList.contains("active")).toBe(true);
      active.val = false;
      expect(el.elt.classList.contains("active")).toBe(false);
    });

    it("stop fn collected in cleanups array stops the effect", () => {
      const active = signal(true);
      const cleanups = [];
      const el = tag("div").classIf("active", active).render(undefined, cleanups);
      expect(cleanups.length).toBe(1);
      cleanups[0](); // stop
      active.val = false;
      expect(el.elt.classList.contains("active")).toBe(true); // no longer updating
    });
  });

  describe("prop()", () => {
    it("sets a DOM property from the signal's initial value", () => {
      const checked = signal(true);
      const el = tag("input").attr("type", "checkbox").prop("checked", checked).render();
      expect(el.elt.checked).toBe(true);
    });

    it("updates the DOM property when signal changes", () => {
      const checked = signal(false);
      const el = tag("input").attr("type", "checkbox").prop("checked", checked).render();
      checked.val = true;
      expect(el.elt.checked).toBe(true);
    });

    it("stop fn collected in cleanups array stops the effect", () => {
      const checked = signal(true);
      const cleanups = [];
      const el = tag("input").attr("type", "checkbox").prop("checked", checked).render(undefined, cleanups);
      expect(cleanups.length).toBe(1);
      cleanups[0](); // stop
      checked.val = false;
      expect(el.elt.checked).toBe(true); // no longer updating
    });
  });

  describe("cleanup propagation through children", () => {
    it("cleanups from child classIf are collected into the parent cleanups array", () => {
      const active = signal(true);
      const cleanups = [];
      tag("div").child(
        tag("span").classIf("on", active),
      ).render(undefined, cleanups);
      expect(cleanups.length).toBe(1);
    });

    it("cleanups from child prop are collected into the parent cleanups array", () => {
      const checked = signal(false);
      const cleanups = [];
      tag("div").child(
        tag("input").prop("checked", checked),
      ).render(undefined, cleanups);
      expect(cleanups.length).toBe(1);
    });
  });

  describe("bindList()", () => {
    it("renders items from a signal array", () => {
      const items = signal(["a", "b"]);
      const el = tag("ul")
        .bindList(items, (item) => tag("li").text(item))
        .render("#root");

      const lis = el.elt.querySelectorAll("li");
      expect(lis.length).toBe(2);
      expect(lis[0].textContent).toBe("a");
      expect(lis[1].textContent).toBe("b");
    });

    it("re-renders when signal changes", () => {
      const items = signal(["a"]);
      const el = tag("ul")
        .bindList(items, (item) => tag("li").text(item))
        .render("#root");

      items.val = ["x", "y", "z"];
      const lis = el.elt.querySelectorAll("li");
      expect(lis.length).toBe(3);
      expect(lis[0].textContent).toBe("x");
    });

    it("shows empty HTML when list is empty", () => {
      const items = signal([]);
      const el = tag("ul")
        .bindList(items, (item) => tag("li").text(item), "<li>None</li>")
        .render("#root");

      expect(el.elt.innerHTML).toBe("<li>None</li>");
    });

    it("clears content when list is empty and no empty HTML is provided", () => {
      const items = signal(["a"]);
      const el = tag("ul")
        .bindList(items, (item) => tag("li").text(item))
        .render("#root");

      items.val = [];
      expect(el.elt.innerHTML).toBe("");
    });

    it("passes index to itemFn", () => {
      const items = signal(["x", "y"]);
      const indices = [];
      tag("ul")
        .bindList(items, (item, i) => {
          indices.push(i);
          return tag("li").text(item);
        })
        .render("#root");

      expect(indices).toEqual([0, 1]);
    });
  });
});

describe("ui.js - createPresets()", () => {
  const theme = {
    btnBase: "btn-base",
    "btn.default": "btn-default",
    "btn.danger": "btn-danger",
    pill: "pill-class",
    fieldLabel: "label-class",
    fieldInput: "input-class",
    fieldRequired: "required-class",
    fieldOptional: "optional-class",
    fieldWrap: "wrap-class",
    fieldWrapSpan2: "wrap-span2-class",
    sectionLabel: "section-class",
    select: "select-class",
    list: "list-class",
    listItem: "list-item-class",
  };

  let ui;

  beforeEach(() => {
    document.body.innerHTML = "";
    ui = createPresets(theme);
  });

  describe("btn()", () => {
    it("renders a button with label and default variant classes", () => {
      const el = ui.btn("Click me", () => {}).render();
      expect(el.elt.tagName).toBe("BUTTON");
      expect(el.elt.textContent).toBe("Click me");
      expect(el.elt.className).toContain("btn-base");
      expect(el.elt.className).toContain("btn-default");
    });

    it("renders a button with a custom variant", () => {
      const el = ui.btn("Delete", () => {}, "danger").render();
      expect(el.elt.className).toContain("btn-danger");
    });

    it("fires the click handler", () => {
      const handler = vi.fn();
      const el = ui.btn("Go", handler).render();
      el.elt.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("pill()", () => {
    it("renders an anchor with text and href", () => {
      const el = ui.pill("Tag", "/tag").render();
      expect(el.elt.tagName).toBe("A");
      expect(el.elt.textContent).toBe("Tag");
      expect(el.elt.getAttribute("href")).toBe("/tag");
      expect(el.elt.className).toBe("pill-class");
    });
  });

  describe("field()", () => {
    it("renders a wrapper div with a label and input", () => {
      const el = ui.field("Email", "email").render();
      expect(el.elt.tagName).toBe("DIV");
      expect(el.elt.querySelector("label")).not.toBeNull();
      expect(el.elt.querySelector("input")).not.toBeNull();
    });

    it("uses fieldWrap class by default", () => {
      const el = ui.field("Name", "text").render();
      expect(el.elt.className).toBe("wrap-class");
    });

    it("uses fieldWrapSpan2 class when span2 is true", () => {
      const el = ui.field("Bio", "text", { span2: true }).render();
      expect(el.elt.className).toBe("wrap-span2-class");
    });

    it("shows required marker by default", () => {
      const el = ui.field("Email", "email").render();
      expect(el.elt.innerHTML).toContain("required-class");
    });

    it("shows optional marker when required is false", () => {
      const el = ui.field("Notes", "text", { required: false }).render();
      expect(el.elt.innerHTML).toContain("optional-class");
    });

    it("sets value, name, and placeholder when provided", () => {
      const el = ui.field("City", "text", {
        value: "Paris",
        name: "city",
        placeholder: "Enter city",
      }).render();
      const input = el.elt.querySelector("input");
      expect(input.getAttribute("value")).toBe("Paris");
      expect(input.getAttribute("name")).toBe("city");
      expect(input.getAttribute("placeholder")).toBe("Enter city");
    });

    it("applies extraCss to the input", () => {
      const el = ui.field("Search", "text", { extraCss: "extra" }).render();
      const input = el.elt.querySelector("input");
      expect(input.className).toContain("input-class");
      expect(input.className).toContain("extra");
    });
  });

  describe("select()", () => {
    it("renders a select element with options", () => {
      const opts = [
        { label: "One", value: "1" },
        { label: "Two", value: "2" },
      ];
      const el = ui.select(opts, () => {}).render();
      expect(el.elt.tagName).toBe("SELECT");
      const options = el.elt.querySelectorAll("option");
      expect(options.length).toBe(2);
      expect(options[0].textContent).toBe("One");
      expect(options[0].value).toBe("1");
    });

    it("calls onChange with the selected value", () => {
      const onChange = vi.fn();
      const opts = [{ label: "A", value: "a" }];
      const el = ui.select(opts, onChange).render();
      // simulate change
      Object.defineProperty(el.elt, "value", { writable: true, value: "a" });
      el.elt.dispatchEvent(new Event("change"));
      expect(onChange).toHaveBeenCalledWith("a");
    });

    it("applies select theme class", () => {
      const el = ui.select([], () => {}).render();
      expect(el.elt.className).toBe("select-class");
    });
  });

  describe("list()", () => {
    it("renders a ul with li items", () => {
      const items = [{ label: "Alpha" }, { label: "Beta" }];
      const el = ui.list(items, () => {}).render();
      expect(el.elt.tagName).toBe("UL");
      const lis = el.elt.querySelectorAll("li");
      expect(lis.length).toBe(2);
      expect(lis[0].textContent).toBe("Alpha");
    });

    it("calls onSelect with the item when clicked", () => {
      const onSelect = vi.fn();
      const items = [{ label: "Item 1" }];
      const el = ui.list(items, onSelect).render();
      el.elt.querySelector("li").click();
      expect(onSelect).toHaveBeenCalledWith(items[0]);
    });

    it("applies list and listItem theme classes", () => {
      const el = ui.list([{ label: "x" }], () => {}).render();
      expect(el.elt.className).toBe("list-class");
      expect(el.elt.querySelector("li").className).toBe("list-item-class");
    });
  });

  describe("sectionLabel()", () => {
    it("renders a p element with text", () => {
      const el = ui.sectionLabel("Section").render();
      expect(el.elt.tagName).toBe("P");
      expect(el.elt.textContent).toContain("Section");
    });

    it("does not show required marker by default", () => {
      const el = ui.sectionLabel("Section").render();
      expect(el.elt.innerHTML).not.toContain("required-class");
    });

    it("shows required marker when required is true", () => {
      const el = ui.sectionLabel("Section", true).render();
      expect(el.elt.innerHTML).toContain("required-class");
    });

    it("applies sectionLabel theme class", () => {
      const el = ui.sectionLabel("Header").render();
      expect(el.elt.className).toBe("section-class");
    });
  });

  describe("createPresets() with empty theme", () => {
    it("works without any theme (uses empty strings)", () => {
      const bare = createPresets();
      expect(() => bare.btn("Go", () => {}).render()).not.toThrow();
      expect(() => bare.pill("Tag", "/").render()).not.toThrow();
      expect(() => bare.field("Name", "text").render()).not.toThrow();
      expect(() => bare.select([], () => {}).render()).not.toThrow();
      expect(() => bare.list([], () => {}).render()).not.toThrow();
      expect(() => bare.sectionLabel("Title").render()).not.toThrow();
    });
  });
});
