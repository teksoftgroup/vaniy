"use strict";

const hook = (element) => ({
  on: (event, callback) => element?.addEventListener(event, callback),
  off: (event, callback) => element?.removeEventListener(event, callback),
});

const text = (element, value) => {
  if (!element) return undefined;
  const prop = "innerText" in element ? "innerText" : "textContent";
  if (value != null) element[prop] = value; // allows empty string
  return element[prop];
};

const html = (element, value) => {
  if (!element) return undefined;
  if (value != null) element.innerHTML = value;
  return element.innerHTML;
};

export const make = (name) => document.createElement(name);

export const makeId = (length) => {
  let result = "";
  const alphaNum =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const alphaNumLength = alphaNum.length;

  for (let i = 0; i < length; i++) {
    result += alphaNum.charAt(Math.floor(Math.random() * alphaNumLength));
  }
  return result;
};

export const parseHtml = (source) => {
  const tmp = document.implementation.createHTMLDocument("");
  tmp.body.innerHTML = source;
  return [...tmp.body.childNodes];
};

export const onPageLoad = (callback) => {
  if (document.readyState !== "loading") callback();
  else document.addEventListener("DOMContentLoaded", callback);
};

export const onWindowLoad = (callback) => {
  window.onload = callback;
};

export const Q = (input) => {
  const selectedElement =
    typeof input === "string" ? document.querySelector(input) : input;

  const safe =
    (fn) =>
    (...args) => {
      if (!selectedElement) return undefined;
      return fn(...args);
    };

  const wrapper = {
    elt: selectedElement,
    value: selectedElement?.value,
    text: (val) => {
      if (val != null) {
        text(selectedElement, val);
        return wrapper;
      }
      return text(selectedElement);
    },
    html: (val) => {
      if (val != null) {
        html(selectedElement, val);
        return wrapper;
      }
      return html(selectedElement);
    },
    val: safe((newVal) => {
      if (newVal != null) {
        if (selectedElement.opt && selectedElement.multiple) {
          const wanted = new Set(Array.isArray(newVal) ? newVal : [newVal]);
          Array.from(selectedElement.options).forEach((opt) => {
            opt.selected = wanted.has(opt.value);
          });
        } else {
          selectedElement.value = newVal;
        }
        wrapper.value = selectedElement.value;
        return wrapper;
      }

      if (selectedElement.options && selectedElement.multiple) {
        return Array.from(selectedElement.options)
          .filter((opt) => opt.selected)
          .map((opt) => opt.value);
      }
      return selectedElement.value;
    }),
    addClass: safe((className) => {
      selectedElement.classList.add(className);
      return wrapper;
    }),
    removeClass: safe((className) => {
      selectedElement.classList.remove(className);
      return wrapper;
    }),
    hasClass: safe((className) => {
      return selectedElement.classList.contains(className);
    }),
    hide: safe(() => {
      selectedElement.style.display = "none";
      return wrapper;
    }),
    show: safe(() => {
      selectedElement.style.display = "";
      return wrapper;
    }),
    prop: safe((propertyName) => selectedElement[propertyName]),
    attr: safe((attributeName) => selectedElement.getAttribute(attributeName)),
    removeAttr: (attributeName) => {
      selectedElement.removeAttribute(attributeName);
    },
    toggle: safe(() => {
      if (selectedElement.style.display == "none") wrapper.show();
      else wrapper.hide();
      return wrapper;
    }),
    css: safe((styleObject) => {
      Object.entries(styleObject).forEach(([key, value]) => {
        selectedElement.style[key] = value;
      });
      return wrapper;
    }),
    on: hook(selectedElement).on,
    off: hook(selectedElement).off,
  };
  return wrapper;
};

export const all = (selector) => {
  const selectedElements = document.querySelectorAll(selector);
  return selectedElements;
};

export const scan = (rootSelector, options = {}) => {
  const refAttr = options.refAttr || "v-ref";

  const root =
    typeof rootSelector === "string"
      ? document.querySelector(rootSelector)
      : rootSelector || document;

  if (!root) throw new Error(`Dom.scan: root "${rootSelector}" not found`);

  const cache = Object.create(null);

  //collect elements
  root.querySelectorAll(`[${refAttr}]`).forEach((el) => {
    const key = el.getAttribute(refAttr);
    if (!key) return;

    const wrapped = Q(el);

    // support multple refs with the same name -> array
    if (cache[key]) {
      if (Array.isArray(cache[key])) cache[key].push(wrapped);
      else cache[key] = [cache[key], wrapped];
    } else {
      cache[key] = wrapped;
    }
  });
  // proxy
  return new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "_") return cache;
        if (prop === "get") return (k) => cache[k];
        if (prop === "all")
          return (k) =>
            cache[k] ? (Array.isArray(cache[k]) ? cache[k] : [cache[k]]) : [];

        if (typeof prop !== "string") return undefined;

        const val = cache[prop];

        if (!val) {
          console.warn(`DOM.scan: ref "${prop}" not found`);
          return Q(null);
        }
        return val;
      },
    },
  );
};

const DOM = {
  Q,
  $: Q,
  all,
  $$: all,
  scan,
  make,
  makeId,
  parseHtml,
  onPageLoad,
  onWindowLoad,
  ping: () => console.log("PONG!"),
  description: "DOM is for dom manipulation",
};

export default DOM;
