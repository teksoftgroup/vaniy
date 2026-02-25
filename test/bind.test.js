import { describe, it, expect, beforeEach } from "vitest";
import { signal } from "../src/reactive.js";
import { bind, bindText, bindHtml, bindValue, bindList, bindOptions, bindClass, bindAttr } from "../src/bind.js";
import { Q } from "../src/dom.js";

describe("bind.js", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="box">initial</div>
      <input id="inp" />
      <select id="sel"></select>
      <button id="btn">Click</button>
    `;
  });

  describe("bind() - text", () => {
    it("sets element text immediately from signal", () => {
      const s = signal("hello");
      bind("#box", "text", s);
      // Use Q wrapper to read text (consistent with how bind writes it)
      expect(Q("#box").text()).toBe("hello");
    });

    it("updates element text when signal changes", () => {
      const s = signal("first");
      bind("#box", "text", s);
      s.val = "second";
      expect(Q("#box").text()).toBe("second");
    });
  });

  describe("bind() - html", () => {
    it("sets element innerHTML immediately from signal", () => {
      const s = signal("<strong>hi</strong>");
      bind("#box", "html", s);
      expect(document.querySelector("#box").innerHTML).toBe("<strong>hi</strong>");
    });

    it("updates innerHTML when signal changes", () => {
      const s = signal("<em>a</em>");
      bind("#box", "html", s);
      s.val = "<em>b</em>";
      expect(document.querySelector("#box").innerHTML).toBe("<em>b</em>");
    });
  });

  describe("bind() - value", () => {
    it("sets input value immediately from signal", () => {
      const s = signal("typed");
      bind("#inp", "value", s);
      expect(document.querySelector("#inp").value).toBe("typed");
    });

    it("updates input value when signal changes", () => {
      const s = signal("v1");
      bind("#inp", "value", s);
      s.val = "v2";
      expect(document.querySelector("#inp").value).toBe("v2");
    });
  });

  describe("bind() - show", () => {
    it("does not hide element when signal is truthy", () => {
      const s = signal(true);
      bind("#box", "show", s);
      expect(document.querySelector("#box").style.display).not.toBe("none");
    });

    it("hides element when signal is falsy", () => {
      const s = signal(false);
      bind("#box", "show", s);
      expect(document.querySelector("#box").style.display).toBe("none");
    });

    it("reacts to signal change: truthy->falsy hides element", () => {
      const s = signal(true);
      bind("#box", "show", s);
      s.val = false;
      expect(document.querySelector("#box").style.display).toBe("none");
    });
  });

  describe("bind() - hide", () => {
    it("hides element when signal is truthy", () => {
      const s = signal(true);
      bind("#box", "hide", s);
      expect(document.querySelector("#box").style.display).toBe("none");
    });

    it("shows element when signal is falsy", () => {
      const s = signal(false);
      bind("#box", "hide", s);
      expect(document.querySelector("#box").style.display).not.toBe("none");
    });

    it("reacts to signal change: falsy->truthy hides element", () => {
      const s = signal(false);
      bind("#box", "hide", s);
      s.val = true;
      expect(document.querySelector("#box").style.display).toBe("none");
    });
  });

  describe("bind() - disabled", () => {
    it("sets disabled = true when signal is truthy", () => {
      const s = signal(true);
      bind("#btn", "disabled", s);
      expect(document.querySelector("#btn").disabled).toBe(true);
    });

    it("sets disabled = false when signal is falsy", () => {
      const s = signal(false);
      bind("#btn", "disabled", s);
      expect(document.querySelector("#btn").disabled).toBe(false);
    });

    it("toggles disabled as signal changes", () => {
      const s = signal(true);
      bind("#btn", "disabled", s);
      s.val = false;
      expect(document.querySelector("#btn").disabled).toBe(false);
      s.val = true;
      expect(document.querySelector("#btn").disabled).toBe(true);
    });
  });

  describe("bind() - default (arbitrary property)", () => {
    it("sets any element property via its key", () => {
      const s = signal("my-class");
      bind("#box", "className", s);
      expect(document.querySelector("#box").className).toBe("my-class");
    });

    it("updates the property when signal changes", () => {
      const s = signal("title-a");
      bind("#box", "title", s);
      s.val = "title-b";
      expect(document.querySelector("#box").title).toBe("title-b");
    });
  });

  describe("bind() - Q-wrapped element as target", () => {
    it("accepts a Q-wrapped element instead of a selector string", () => {
      // getElement() only wraps strings; pass a Q wrapper for non-string targets
      const wrapped = Q("#box");
      const s = signal("direct");
      bind(wrapped, "text", s);
      expect(Q("#box").text()).toBe("direct");
    });
  });

  describe("bindText()", () => {
    it("sets element text immediately from signal", () => {
      const s = signal("hello");
      bindText("#box", s);
      expect(Q("#box").text()).toBe("hello");
    });

    it("updates element text when signal changes", () => {
      const s = signal("first");
      bindText("#box", s);
      s.val = "second";
      expect(Q("#box").text()).toBe("second");
    });

    it("accepts a Q-wrapped element as target", () => {
      const s = signal("wrapped");
      bindText(Q("#box"), s);
      expect(Q("#box").text()).toBe("wrapped");
    });
  });

  describe("bindHtml()", () => {
    it("sets innerHTML immediately from signal", () => {
      const s = signal("<strong>hi</strong>");
      bindHtml("#box", s);
      expect(document.querySelector("#box").innerHTML).toBe("<strong>hi</strong>");
    });

    it("updates innerHTML when signal changes", () => {
      const s = signal("<em>a</em>");
      bindHtml("#box", s);
      s.val = "<em>b</em>";
      expect(document.querySelector("#box").innerHTML).toBe("<em>b</em>");
    });

    it("accepts a Q-wrapped element as target", () => {
      const s = signal("<b>wrapped</b>");
      bindHtml(Q("#box"), s);
      expect(document.querySelector("#box").innerHTML).toBe("<b>wrapped</b>");
    });
  });

  describe("bindValue()", () => {
    it("sets input value immediately from signal", () => {
      const s = signal("typed");
      bindValue("#inp", s);
      expect(document.querySelector("#inp").value).toBe("typed");
    });

    it("updates input value when signal changes", () => {
      const s = signal("v1");
      bindValue("#inp", s);
      s.val = "v2";
      expect(document.querySelector("#inp").value).toBe("v2");
    });

    it("accepts a Q-wrapped element as target", () => {
      const s = signal("wrapped");
      bindValue(Q("#inp"), s);
      expect(document.querySelector("#inp").value).toBe("wrapped");
    });
  });

  describe("bindList()", () => {
    it("renders items using the template function", () => {
      const s = signal(["a", "b", "c"]);
      bindList("#box", s, (item) => `<span>${item}</span>`);
      expect(document.querySelector("#box").innerHTML).toBe(
        "<span>a</span><span>b</span><span>c</span>",
      );
    });

    it("renders the empty fallback when list is empty", () => {
      const s = signal([]);
      bindList("#box", s, (item) => `<li>${item}</li>`, "<p>No items</p>");
      expect(document.querySelector("#box").innerHTML).toBe("<p>No items</p>");
    });

    it("renders empty string by default when list is empty", () => {
      const s = signal([]);
      bindList("#box", s, (item) => `<li>${item}</li>`);
      expect(document.querySelector("#box").innerHTML).toBe("");
    });

    it("updates the DOM when signal value changes", () => {
      const s = signal(["x"]);
      bindList("#box", s, (item) => `<li>${item}</li>`);
      s.val = ["a", "b"];
      expect(document.querySelector("#box").innerHTML).toBe(
        "<li>a</li><li>b</li>",
      );
    });

    it("accepts a Q-wrapped element as target", () => {
      // getElement() only wraps strings; pass a Q wrapper for non-string targets
      const wrapped = Q("#box");
      const s = signal([1, 2]);
      bindList(wrapped, s, (n) => `<span>${n}</span>`);
      expect(Q("#box").html()).toBe("<span>1</span><span>2</span>");
    });
  });

  describe("bindOptions()", () => {
    it("renders options with default value='id' and label='name' keys", () => {
      const s = signal([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);
      bindOptions("#sel", s);
      const html = document.querySelector("#sel").innerHTML;
      expect(html).toContain('<option value="">Select ...</option>');
      expect(html).toContain('<option value="1">Alice</option>');
      expect(html).toContain('<option value="2">Bob</option>');
    });

    it("renders with custom value and label keys", () => {
      const s = signal([{ code: "US", country: "United States" }]);
      bindOptions("#sel", s, { value: "code", label: "country" });
      const html = document.querySelector("#sel").innerHTML;
      expect(html).toContain('<option value="US">United States</option>');
    });

    it("renders custom placeholder text", () => {
      const s = signal([]);
      bindOptions("#sel", s, { placeholder: "-- Choose --" });
      expect(document.querySelector("#sel").innerHTML).toContain(
        '<option value="">-- Choose --</option>',
      );
    });

    it("handles null signal value gracefully (treats as empty list)", () => {
      const s = signal(null);
      expect(() => bindOptions("#sel", s)).not.toThrow();
      expect(document.querySelector("#sel").innerHTML).toContain(
        '<option value="">Select ...</option>',
      );
    });

    it("updates options when signal changes", () => {
      const s = signal([{ id: 1, name: "First" }]);
      bindOptions("#sel", s);
      s.val = [
        { id: 1, name: "First" },
        { id: 2, name: "Second" },
      ];
      const opts = document.querySelector("#sel").querySelectorAll("option");
      expect(opts.length).toBe(3); // placeholder + 2
    });
  });

  describe("bindClass()", () => {
    it("adds the class when signal is truthy", () => {
      const s = signal(true);
      bindClass("#box", "active", s);
      expect(document.querySelector("#box").classList.contains("active")).toBe(
        true,
      );
    });

    it("removes the class when signal is falsy", () => {
      const el = document.querySelector("#box");
      el.classList.add("active");
      const s = signal(false);
      bindClass("#box", "active", s);
      expect(el.classList.contains("active")).toBe(false);
    });

    it("reacts to signal changes", () => {
      const s = signal(false);
      bindClass("#box", "highlight", s);
      const el = document.querySelector("#box");
      expect(el.classList.contains("highlight")).toBe(false);
      s.val = true;
      expect(el.classList.contains("highlight")).toBe(true);
      s.val = false;
      expect(el.classList.contains("highlight")).toBe(false);
    });

    it("accepts a Q-wrapped element as target", () => {
      const wrapped = Q("#box");
      const s = signal(true);
      bindClass(wrapped, "selected", s);
      expect(document.querySelector("#box").classList.contains("selected")).toBe(true);
    });
  });

  describe("bindAttr()", () => {
    it("sets the attribute immediately from signal", () => {
      const s = signal("https://example.com");
      bindAttr("#box", "data-url", s);
      expect(document.querySelector("#box").getAttribute("data-url")).toBe(
        "https://example.com",
      );
    });

    it("updates the attribute when signal changes", () => {
      const s = signal("v1");
      bindAttr("#box", "data-state", s);
      s.val = "v2";
      expect(document.querySelector("#box").getAttribute("data-state")).toBe(
        "v2",
      );
    });

    it("accepts a Q-wrapped element as target", () => {
      // bindAttr accesses el.elt.setAttribute, so el must be a Q wrapper
      const wrapped = Q("#box");
      const s = signal("42");
      bindAttr(wrapped, "aria-label", s);
      expect(document.querySelector("#box").getAttribute("aria-label")).toBe("42");
    });
  });
});
