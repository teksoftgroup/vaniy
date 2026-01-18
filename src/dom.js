"use strict";

const hook = (element) => ({
  on: (event, callback) => element.addEventListener(event, callback),
  off: (event, callback) => element.removeEventListener(event, callback),
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

export const Q = (selector) => {
  const selectedElement = document.querySelector(selector);

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
    print: () => {
      return selectedElement;
    },
    html: (val) => {
      if (val != null) {
        html(selectedElement, val);
        return wrapper;
      }
      return html(selectedElement);
    },
    val: () => {
      if (selectedElement.options && selectedElement.multiple) {
        return Array.from(selectedElement.options)
          .filter((opt) => opt.selected)
          .map((opt) => opt.value);
      }
      return selectedElement.value;
    },
    addClass: (className) => {
      selectedElement.classList.add(className);
      return wrapper;
    },
    removeClass: (className) => {
      selectedElement.classList.remove(className);
      return wrapper;
    },
    hasClass: (className) => {
      return selectedElement.classList.contains(className);
    },
    hide: () => {
      selectedElement.style.display = "none";
    },
    show: () => {
      selectedElement.style.display = "";
    },
    prop: (propertyName) => {
      return selectedElement[propertyName];
    },
    attr: (attributeName) => {
      return selectedElement.getAttribute(attributeName);
    },
    removeAttr: (attributeName) => {
      selectedElement.removeAttribute(attributeName);
    },
    toggle: () => {
      if (selectedElement.style.display == "none") wrapper.show();
      else wrapper.hide();
    },
    css: (styleObject) => {
      Object.entries(styleObject).forEach(([key, value]) => {
        selectedElement.style[key] = value;
      });
      return wrapper;
    },
    on: hook(selectedElement).on,
    off: hook(selectedElement).off,
  };
  return wrapper;
};

export const all = (selector) => {
  const selectedElements = document.querySelectorAll(selector);
  return selectedElements;
};

const DOM = {
  Q,
  $: Q,
  all,
  $$: all,
  make,
  makeId,
  parseHtml,
  onPageLoad,
  onWindowLoad,
  ping: () => console.log("PONG!"),
  description: "DOM is for dom manipulation",
};

export default DOM;
