"use strict";

import { effect } from "./reactive.js";
import { Q } from "./dom.js";

// ── Core builder ────────────────────────────────────────────────────────────

function tag(name) {
  const state = {
    tag: name,
    text: "",
    attrs: {},
    listeners: [],
    children: [],
    _html: null,
    _list: null,
    _classBinders: [],
    _propBinders: [],
  };

  const builder = {
    /**
     * Set text content.
     * @param {string} t
     */
    text(t) {
      state.text = t;
      return builder;
    },

    /**
     * Set innerHTML.
     * @param {string} h
     */
    html(h) {
      state._html = h;
      return builder;
    },

    /**
     * Set class attribute.
     * @param {string} c - Space-separated class names
     */
    css(c) {
      state.attrs.class = c;
      return builder;
    },

    /**
     * Set an arbitrary attribute.
     * @param {string} k - Attribute name
     * @param {string} v - Attribute value
     */
    attr(k, v) {
      state.attrs[k] = v;
      return builder;
    },

    /**
     * Set a data-* attribute.
     * @param {string} k - Data key (without the "data-" prefix)
     * @param {string} v - Data value
     */
    data(k, v) {
      state.attrs["data-" + k] = v;
      return builder;
    },

    /**
     * Attach a DOM event listener.
     * @param {string}   event - Event name (e.g. "click", "input")
     * @param {Function} fn    - Handler function
     */
    on(event, fn) {
      state.listeners.push([event, fn]);
      return builder;
    },

    /**
     * Append one or more child builders (or raw DOM elements).
     * @param {...(Object|HTMLElement)} builders
     */
    child(...builders) {
      state.children.push(...builders);
      return builder;
    },

    /**
     * Capture a reference to the rendered element.
     * The callback is called synchronously during render() with the Q-wrapped
     * element, before onMount fires. Use this inside function components to
     * get a handle on child elements for reactive binding.
     * @param {Function} fn - Receives the Q-wrapped element
     */
    ref(fn) {
      state._ref = fn;
      return builder;
    },

    /**
     * Reactively toggle a CSS class based on a signal.
     * The effect is collected during render() and cleaned up on destroy().
     * @param {string} className
     * @param {Object} sig - Signal whose truthy/falsy value controls the class
     */
    classIf(className, sig) {
      state._classBinders.push({ className, sig });
      return builder;
    },

    /**
     * Reactively set a DOM property from a signal.
     * The effect is collected during render() and cleaned up on destroy().
     * @param {string} name - DOM property name (e.g. "checked", "disabled")
     * @param {Object} sig  - Signal whose value is assigned to the property
     */
    prop(name, sig) {
      state._propBinders.push({ name, sig });
      return builder;
    },

    /**
     * Conditionally include this element.
     * Returns the builder unchanged if the condition is truthy,
     * otherwise returns a no-op builder whose render() returns null.
     * @param {boolean} condition
     */
    when(condition) {
      return condition ? builder : _noop();
    },

    /**
     * Bind a reactive list signal to this element's children.
     * Each item in the signal array is mapped through `itemFn`
     * to produce a builder (or DOM element) that is appended.
     * @param {Object}   sig    - A vaniy signal whose .val is an array
     * @param {Function} itemFn - (item, index) => builder or HTMLElement
     * @param {string}   [empty=""] - HTML to show when the list is empty
     */
    bindList(sig, itemFn, empty) {
      state._list = { sig, itemFn, empty: empty || "" };
      return builder;
    },

    /**
     * Build the real DOM element, optionally appending it to a target.
     * Returns a vaniy Q-wrapped element for seamless integration
     * with bind(), bindText(), etc.
     *
     * @param {string|HTMLElement} [target]   - CSS selector or DOM node
     * @param {Function[]}         [cleanups] - Array to collect stop fns from
     *   reactive bindings (.classIf, .prop, .bindList). Pass the component's
     *   cleanup array so effects are disposed on destroy().
     * @returns {Object} Q-wrapped element
     */
    render(target, cleanups = []) {
      const el = document.createElement(state.tag);

      // Static content
      if (state.text) el.textContent = state.text;
      if (state._html) el.innerHTML = state._html;

      // Attributes
      Object.entries(state.attrs).forEach(([k, v]) => el.setAttribute(k, v));

      // Event listeners
      state.listeners.forEach(([evt, fn]) => el.addEventListener(evt, fn));

      // Children — accepts builders, Q-wrapped, or raw DOM nodes
      state.children.forEach((c) => {
        if (c === null || c === undefined) return;
        if (typeof c.render === "function") {
          const child = c.render(undefined, cleanups);
          if (child) el.appendChild(child.elt || child);
        } else {
          el.appendChild(c.elt || c);
        }
      });

      // Reactive class bindings
      state._classBinders.forEach(({ className, sig }) => {
        cleanups.push(effect(() => {
          sig.val ? el.classList.add(className) : el.classList.remove(className);
        }));
      });

      // Reactive prop bindings
      state._propBinders.forEach(({ name, sig }) => {
        cleanups.push(effect(() => {
          el[name] = sig.val;
        }));
      });

      // Reactive list binding
      if (state._list) {
        const { sig, itemFn, empty } = state._list;
        cleanups.push(effect(() => {
          const items = sig.val;
          el.innerHTML = "";
          if (!items || !items.length) {
            if (empty) el.innerHTML = empty;
            return;
          }
          items.forEach((item, i) => {
            const child = itemFn(item, i);
            if (child) {
              const node = child.render ? child.render(undefined, cleanups) : child;
              el.appendChild(node.elt || node);
            }
          });
        }));
      }

      // Ref callback — fires before the element is appended to the DOM
      if (state._ref) state._ref(Q(el));

      // Mount to target
      if (target) {
        const parent =
          typeof target === "string" ? document.querySelector(target) : target;
        if (parent) parent.appendChild(el);
      }

      return Q(el);
    },
  };

  return builder;
}

// No-op builder for .when(false) — renders nothing, all methods are safe to chain.
function _noop() {
  const noop = {
    text: () => noop,
    html: () => noop,
    css: () => noop,
    attr: () => noop,
    data: () => noop,
    on: () => noop,
    ref: () => noop,
    child: () => noop,
    when: () => noop,
    bindList: () => noop,
    classIf: () => noop,
    prop: () => noop,
    render: () => null,
  };
  return noop;
}

// ── Preset factory ──────────────────────────────────────────────────────────

/**
 * Create a set of themed presets.
 * The theme object maps token names to CSS class strings.
 * Presets use these tokens so the builder stays framework-agnostic
 * (Tailwind, Bootstrap, Foundation, custom CSS — anything works).
 *
 * @param {Object} theme - Map of token names to class strings
 * @returns {Object} Preset functions: btn, pill, field, select, list, sectionLabel
 *
 * @example
 * // Tailwind theme
 * const ui = createPresets({
 *   btnBase:        'font-medium px-6 py-2.5 rounded-full text-sm transition-colors',
 *   'btn.default':  'bg-blue-600 text-white hover:bg-blue-700',
 *   'btn.danger':   'bg-red-600 text-white hover:bg-red-700',
 *   pill:           'inline-block text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full',
 *   fieldLabel:     'block text-xs font-medium text-gray-600 mb-1',
 *   fieldInput:     'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
 *   fieldRequired:  'text-red-400',
 *   fieldOptional:  'text-gray-400 font-normal',
 *   fieldWrap:      '',
 *   fieldWrapSpan2: 'sm:col-span-2',
 *   sectionLabel:   'text-xs font-medium text-gray-500 uppercase tracking-wide mb-2',
 *   select:         'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
 *   list:           'space-y-1',
 *   listItem:       'px-3 py-2 hover:bg-gray-100 cursor-pointer rounded',
 * });
 *
 * // Bootstrap theme
 * const ui = createPresets({
 *   btnBase:        'btn',
 *   'btn.default':  'btn-primary',
 *   'btn.danger':   'btn-danger',
 *   pill:           'badge rounded-pill bg-primary',
 *   fieldLabel:     'form-label',
 *   fieldInput:     'form-control',
 *   fieldRequired:  'text-danger',
 *   fieldOptional:  'text-muted',
 *   fieldWrap:      'mb-3',
 *   fieldWrapSpan2: 'mb-3 col-12',
 *   sectionLabel:   'form-text fw-bold text-uppercase mb-2',
 *   select:         'form-select',
 *   list:           'list-group',
 *   listItem:       'list-group-item list-group-item-action',
 * });
 */
function createPresets(theme = {}) {
  const t = (key, fallback = "") => theme[key] || fallback;

  return {
    /**
     * Button preset.
     * @param {string}   text    - Button label
     * @param {Function} fn      - Click handler
     * @param {string}   [variant="default"] - Style variant key
     */
    btn: (text, fn, variant = "default") =>
      tag("button")
        .text(text)
        .on("click", fn)
        .css(`${t("btnBase")} ${t("btn." + variant, t("btn.default"))}`.trim()),

    /**
     * Pill / badge link preset.
     * @param {string} text - Display text
     * @param {string} url  - Link href
     */
    pill: (text, url) =>
      tag("a")
        .text(text)
        .attr("href", url)
        .css(t("pill")),

    /**
     * Form field preset (label + input).
     * @param {string} label - Label text
     * @param {string} type  - Input type (text, email, tel, etc.)
     * @param {Object} [opts]
     * @param {boolean} [opts.required=true]
     * @param {boolean} [opts.span2=false]
     * @param {string}  [opts.value=""]
     * @param {string}  [opts.name=""]
     * @param {string}  [opts.placeholder=""]
     * @param {string}  [opts.extraCss=""]
     */
    field: (label, type, opts = {}) => {
      const {
        required = true,
        span2 = false,
        value = "",
        name = "",
        placeholder = "",
        extraCss = "",
      } = opts;

      const lbl = tag("label")
        .css(t("fieldLabel"))
        .html(
          label +
            (required
              ? ` <span class="${t("fieldRequired")}">*</span>`
              : ` <span class="${t("fieldOptional")}">(optional)</span>`),
        );

      const input = tag("input")
        .attr("type", type)
        .css(`${t("fieldInput")} ${extraCss}`.trim());

      if (value) input.attr("value", value);
      if (name) input.attr("name", name);
      if (placeholder) input.attr("placeholder", placeholder);

      return tag("div")
        .css(span2 ? t("fieldWrapSpan2") : t("fieldWrap"))
        .child(lbl, input);
    },

    /**
     * Select dropdown preset.
     * @param {Array<{label: string, value: string}>} options
     * @param {Function} onChange - Receives the selected value
     */
    select: (options, onChange) =>
      tag("select")
        .css(t("select"))
        .on("change", (e) => onChange(e.target.value))
        .child(
          ...options.map((opt) =>
            tag("option").text(opt.label).attr("value", opt.value),
          ),
        ),

    /**
     * Clickable list preset.
     * @param {Array<{label: string}>} items
     * @param {Function} onSelect - Receives the selected item
     */
    list: (items, onSelect) =>
      tag("ul")
        .css(t("list"))
        .child(
          ...items.map((item) =>
            tag("li")
              .text(item.label)
              .css(t("listItem"))
              .on("click", () => onSelect(item)),
          ),
        ),

    /**
     * Section label / heading preset.
     * @param {string}  text
     * @param {boolean} [required=false]
     */
    sectionLabel: (text, required = false) =>
      tag("p")
        .css(t("sectionLabel"))
        .html(
          text +
            (required
              ? ` <span class="${t("fieldRequired")}">*</span>`
              : ""),
        ),
  };
}

export { tag, createPresets };
