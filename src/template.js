const MARKER = `__tpl_${Math.random().toString(36).slice(2, 8)}__`;
const MARKER_ATTR = `data-vjs`;
const attrMarkerRe = new RegExp(`${MARKER}(\\d+)`, "g");

const templateCache = new WeakMap();

class TemplateResult {
  constructor(strings, values) {
    this.strings = strings;
    this.values = values;
  }
}

export function html(strings, ...values) {
  return new TemplateResult(strings, values);
}

function isSignal(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    "val" in value &&
    "subscribe" in value
  );
}

function buildTemplate(strings) {
  let cached = templateCache.get(strings);
  if (cached) return cached;

  let markup = "";
  const parts = [];

  for (let i = 0; i < strings.length; i++) {
    markup += strings[i];
    if (i < strings.length - 1) {
      const prior = markup;
      const lastOpen = prior.lastIndexOf("<");
      const lastClose = prior.lastIndexOf(">");
      const inTag = lastOpen > lastClose;

      if (inTag) {
        const boolMatch = prior.match(/\?\s*([\w-]+)\s*=\s*$/);
        const propMatch = prior.match(/\.\s*([\w-]+)\s*=\s*$/);
        const eventMatch = prior.match(/@\s*([\w-]+)\s*=\s*$/);
        const attrMatch = prior.match(/([\w-]+)\s*=\s*("?)$/);

        if (boolMatch) {
          markup = prior.slice(0, boolMatch.index);
          parts.push({ type: "bool", name: boolMatch[1], index: i });
          markup += `${MARKER_ATTR}-${i}=""`;
        } else if (propMatch) {
          markup = prior.slice(0, propMatch.index);
          parts.push({ type: "prop", name: propMatch[1], index: i });
          markup += `${MARKER_ATTR}-${i}=""`;
        } else if (eventMatch) {
          markup = prior.slice(0, eventMatch.index);
          parts.push({ type: "event", name: eventMatch[1], index: i });
          markup += `${MARKER_ATTR}-${i}=""`;
        } else if (attrMatch) {
          parts.push({ type: "attribute", name: attrMatch[1], index: i });
          // If already inside an open quote the closing " comes from strings[i+1];
          // otherwise wrap the marker so the template stays valid HTML.
          markup += attrMatch[2] ? `${MARKER}${i}` : `"${MARKER}${i}"`;
        } else {
          parts.push({ type: "attribute", name: "__unknown__", index: i });
          markup += `${MARKER}${i}`;
        }
      } else {
        parts.push({ type: "node", index: i });
        markup += `<!--${MARKER}${i}-->`;
      }
    }
  }

  const tpl = document.createElement("template");
  tpl.innerHTML = markup;

  cached = { tpl, parts };
  templateCache.set(strings, cached);
  return cached;
}

function walkTemplate(root, parts) {
  const bindings = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
    null,
  );

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const match = node.textContent.match(new RegExp(`^${MARKER}(\\d+)$`));
      if (match) {
        const idx = Number(match[1]);
        const part = parts.find((p) => p.index === idx);
        if (part) bindings.push({ ...part, node });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const part of parts) {
        if (part.type === "bool" || part.type === "prop" || part.type === "event") {
          if (node.hasAttribute(`${MARKER_ATTR}-${part.index}`)) {
            node.removeAttribute(`${MARKER_ATTR}-${part.index}`);
            bindings.push({ ...part, node });
          }
        } else if (part.type === "attribute") {
          for (const attr of Array.from(node.attributes)) {
            if (attr.value.includes(`${MARKER}${part.index}`)) {
              bindings.push({ ...part, node, attrName: attr.name });
              break;
            }
          }
        }
      }
    }
  }
  return bindings;
}

function commitAttribute(binding, value) {
  const attrName = binding.attrName || binding.name;
  if (value == null || value === false) {
    binding.node.removeAttribute(attrName);
  } else {
    const current = binding.node.getAttribute(attrName) || "";
    if (current.includes(MARKER)) {
      binding.node.setAttribute(
        attrName,
        current.replace(attrMarkerRe, String(value)),
      );
    } else {
      binding.node.setAttribute(attrName, String(value));
    }
  }
}

function commitNode(binding, value, cleanups) {
  const { node } = binding;

  if (binding._nodes) {
    for (const n of binding._nodes) n.remove();
    if (binding._subCleanups) binding._subCleanups.forEach((fn) => fn());
    binding._nodes = null;
    binding._subCleanups = null;
  }

  const subCleanups = [];

  if (value == null || value === false) {
    binding._nodes = [];
  } else if (value instanceof TemplateResult) {
    const frag = renderLive(value, subCleanups);
    const nodes = Array.from(frag.childNodes);
    node.parentNode.insertBefore(frag, node);
    binding._nodes = nodes;
  } else if (Array.isArray(value)) {
    const frag = document.createDocumentFragment();
    const nodes = [];
    for (const item of value) {
      if (item instanceof TemplateResult) {
        const f = renderLive(item, subCleanups);
        nodes.push(...Array.from(f.childNodes));
        frag.appendChild(f);
      } else if (item != null && item !== false) {
        const t = document.createTextNode(String(item));
        nodes.push(t);
        frag.appendChild(t);
      }
    }
    node.parentNode.insertBefore(frag, node);
    binding._nodes = nodes;
  } else if (value instanceof Node) {
    node.parentNode.insertBefore(value, node);
    binding._nodes = [value];
  } else {
    const t = document.createTextNode(String(value));
    node.parentNode.insertBefore(t, node);
    binding._nodes = [t];
  }

  binding._subCleanups = subCleanups;
}

function commitValue(binding, value, cleanups) {
  const { type, node, name } = binding;

  switch (type) {
    case "node":
      commitNode(binding, value, cleanups);
      break;
    case "attribute":
      commitAttribute(binding, value);
      break;
    case "bool":
      if (value) node.setAttribute(name, "");
      else node.removeAttribute(name);
      break;
    case "prop":
      node[name] = value;
      break;
    case "event":
      if (binding._listener) node.removeEventListener(name, binding._listener);
      if (typeof value === "function") {
        node.addEventListener(name, value);
        binding._listener = value;
      }
      break;
  }
}

function commitLive(binding, value, cleanups) {
  if (isSignal(value)) {
    commitValue(binding, value.peek(), cleanups);
    const unsub = value.subscribe(() => {
      if (!binding.node.isConnected) return;
      commitValue(binding, value.val, cleanups);
    });
    cleanups.push(unsub);
  } else {
    commitValue(binding, value, cleanups);
  }
}

function renderLive(templateResult, cleanups) {
  const { strings, values } = templateResult;
  const { tpl, parts } = buildTemplate(strings);

  const clone = tpl.content.cloneNode(true);
  const bindings = walkTemplate(clone, parts);

  for (const binding of bindings) {
    commitLive(binding, values[binding.index], cleanups);
  }

  return clone;
}

export function render(templateResult, target) {
  const el =
    typeof target === "string" ? document.querySelector(target) : target;
  const cleanups = [];

  const frag = renderLive(templateResult, cleanups);
  el.innerHTML = "";
  el.appendChild(frag);

  return () => {
    cleanups.forEach((fn) => fn());
    el.innerHTML = "";
  };
}
