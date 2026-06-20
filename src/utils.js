"use strict";

export const redirect = (url) => (window.location.href = url);
export const isArray = (arr) => Array.isArray(arr);
export const isArrayEmpty = (arr) => !(Array.isArray(arr) && arr.length > 0);
export const isFocus = (element) => element == document.activeElement;

const currencyMap = {
  US: { locale: "en-US", currency: "USD" },
  CA: { locale: "en-CA", currency: "CAD" },
  FR: { locale: "fr-FR", currency: "EUR" },
  HT: { locale: "ht-HT", currency: "HTG" },
  GB: { locale: "en-GB", currency: "GBP" },
  AU: { locale: "en-AU", currency: "AUD" },
};

export const toCurrency = (
  value,
  { locale = "en-US", currency = "USD" } = {},
) =>
  Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(value);

export const formatByCountry = (value, countryCode) => {
  const config = currencyMap[countryCode] ?? currencyMap["US"];
  return toCurrency(value, config);
};

export const isValidRoutingNumber = (routingNumber) => {
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }

  // Split the routing number into individual digits
  const digits = routingNumber.split("").map(Number);

  // Calculate the weighted sum
  const sum =
    7 * (digits[0] + digits[3] + digits[6]) +
    3 * (digits[1] + digits[4] + digits[7]) +
    1 * (digits[2] + digits[5] + digits[8]);

  // Check if the sum is a multiple of 10
  return sum % 10 === 0;
};

function isNumericLike(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  const s = value.trim();
  if (!s) return false;
  return /^-?\d+(\.\d+)?$/.test(s);
}

export function autoSize(value) {
  if (Array.isArray(value)) return value.length;
  if (isNumericLike(value)) return Number(String(value).trim());
  return String(value ?? "").length;
}

export function parseMinMax(param) {
  const [minRaw, maxRaw] = String(param ?? "")
    .split(",")
    .map((s) => s.trim());

  const min = Number(minRaw);
  const max = Number(maxRaw);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

// is v null or undefined OR is v string empty
export function isBlank(v) {
  return v == null || String(v ?? "").trim() === "";
}

export function fromCamelToKebabCase(camel) {
  return camel.replace(/[A-Z]/g, (char) => "-" + char.toLowerCase());
}

export function observe(obj, onChange) {
  return new Proxy(obj, {
    set(target, key, value) {
      Reflect.set(target, key, value);
      onChange({ key, value });
      return true;
    },
  });
}

export const deepClone = (target) => structuredClone(target);

export const curry = (fn) => {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    }
    return (...next) => curried(...args, ...next);
  };
};

export const chainAsync = (acc, val) => acc.then(val);

export const sequenceAsync =
  (...fns) =>
  (fn) =>
    fns.reduce(chainAsync, Promise.resolve(fn));

export const tryCatch = (promise) =>
  promise.then((data) => [null, data]).catch((err) => [err, null]);

export async function flow(initial, ...fns) {
  let val = initial;

  for (const fn of fns) {
    const [err, res] = await tryCatch(typeof fn === "function" ? fn(val) : fn);
    if (err) return [err, null];
    val = res;
  }

  return [null, val];
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const each =
  (list, separator = "") =>
  (template) =>
    (list ?? []).map(template).join(separator);

export const when = (condition, template) => (condition ? template : "");

export const options = (list, valueKey, labelKey) =>
  each(list)((i) => `<option value="${i[valueKey]}">${i[labelKey]}</option>`);

// Select with a placeholder prepended
export const select = (list, valueKey, labelKey, placeHolder = "Choose...") =>
  `<option value="">${placeHolder}</option>` +
  options(list, valueKey, labelKey);

// radio group
export const radios = (list, name) =>
  each(list)(
    (i) =>
      `<label><input type="radio" name="${name}" value="${i.id}">${i.label}</label>`,
  );

// Table rows from an array of column keys
export const rows = (list, keys) =>
  each(list)((r) => `<tr>${each(keys)((k) => `<td>${r[k]}</td>`)}</tr>`);

// Nested: optgroups, each with its own options
export const optgroups = (groups) =>
  each(groups)(
    (g) =>
      `<optgroup label="${g.label}">${options(g.items, "id", "name")}</optgroup>`,
  );

// Numbered list using the index arg
export const ol = (list) =>
  each(list, "\n")((item, idx) => `<li value="${idx + 1}">${item}</li>`);

// Comma-separated text (sep isn't HTML-specific)
export const csv = (list) => each(list, ", ")((i) => i.name);

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
