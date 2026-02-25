"use strict";

import { effect } from "./reactive.js";
import { Q } from "./dom.js";

function getElement(target) {
  return typeof target === "string" ? Q(target) : target;
}

export function bind(target, prop, sig) {
  const el = getElement(target);

  return effect(() => {
    const val = sig.val;
    switch (prop) {
      case "text":
        el.text(val);
        break;
      case "html":
        el.html(val);
        break;
      case "value":
        el.val(val);
        break;
      case "show":
        val ? el.show() : el.hide();
        break;
      case "hide":
        val ? el.hide() : el.show();
        break;
      case "disabled":
        el.elt.disabled = !!val;
        break;
      default:
        el.elt[prop] = val;
    }
  });
}

export function bindText(target, sig) {
  const el = getElement(target);

  return effect(() => {
    const val = sig.val;
    el.text(val);
  });
}

export function bindHtml(target, sig) {
  const el = getElement(target);

  return effect(() => {
    const val = sig.val;
    el.html(val);
  });
}

export function bindValue(target, sig) {
  const el = getElement(target);

  return effect(() => {
    const val = sig.val;
    el.val(val);
  });
}

export function bindList(target, sig, template, empty = "") {
  const el = getElement(target);

  return effect(() => {
    const items = sig.val;
    el.html(items?.length ? items.map(template).join("") : empty);
  });
}

export function bindOptions(target, sig, opts = {}) {
  const { value = "id", label = "name", placeholder = "Select ..." } = opts;

  const el = getElement(target);

  return effect(() => {
    const items = sig.val || [];
    el.html(
      `<option value="">${placeholder}</option>` +
        items
          .map(
            (item) => `<option value="${item[value]}">${item[label]}</option>`,
          )
          .join(""),
    );
  });
}

export function bindClass(target, className, sig) {
  const el = getElement(target);

  return effect(() => {
    sig.val ? el.addClass(className) : el.removeClass(className);
  });
}

export function bindAttr(target, attr, sig) {
  const el = getElement(target);
  return effect(() => {
    el.elt.setAttribute(attr, sig.val);
  });
}
