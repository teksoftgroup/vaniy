const MARKER = `__tpl_${Math.random().toString(36).slice(2, 8)}__`;
const MARKER_ATTR = `data-vjs`;
const nodeMarkerRe = new RegExp(`<!--${MARKER}(\\d+)-->`);
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

function buildTemplate(strings) {
  let cached = templateCache.get(strings);
  if (cached) return cached;

  let markup = "";
  const parts = [];

  for (let i = 0; i < strings.length; i++) {
    markup += strings[i];
    if (i < strings.length - 1) {
      // are we inside tag's attributes
      const prior = markup;
      const lastOpen = prior.lastIndexOf("<");
      const lastClose = prior.lastIndexOf(">");
      const inTag = lastOpen > lastClose;

      if (inTag) {
        // match ?attr=
        const boolMatch = prior.match(/\?\s*([\w-]+)\s*=\s*$/);
        // match .prop=
        const propMatch = prior.match(/\.\s*([\w-]+)\s*=\s*$/);
        // match @event=
        const eventMatch = prior.match(/@\s*([\w-]+)\s*=\s*$/);
        // match attr=
        const attrMatch = prior.match(/([\w-]+)\s*=\s*("?)$/);

        if (boolMatch) {
          // remove the ?attr= from markup
          markup = prior.slice(0, boolMatch.index);
          parts.push({ type: "bool", name: boolMatch[1], index: i });
          // add a hidden marker attribute
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
          markup += `${MARKER}${i}=""`;
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
    NodeFilter.SHOW_ELEMENT || NodeFilter.SHOW_COMMENT,
    null,
  );

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const match = node.textContent.match(new RegExp(`^${MARKER}(\\d+)$`));
      if (match) {
        const idx = Number(match[1]);
        const part = parts.find((p) => p.index === idx);
        if (part) {
          bindings.push({ ...part, node });
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Check for marker attributes on this element
      for (const part of parts) {
        if (
          part.type === "bool" ||
          part.type === "property" ||
          part.type === "event"
        ) {
          if (node.hasAttribute(`${MARKER_ATTR}-${part.index}`)) {
            node.removeAttribute(`${MARKER_ATTR}-${part.index}`);
            bindings.push({ ...part, node });
          }
        } else if (part.type === "attribute") {
          // Check attributes for marker values
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

function commitValue(binding, value, prevValue) {
  const { type, node, name } = binding;

  switch (type) {
    case "node":
      commitNode(binding, value, prevValue);
      break;
    case "attribute":
      commitAttribute(binding, value);
      break;
    case "bool-attr":
      if (value) node.setAttribute(name, "");
      else node.removeAttribute(name);
      break;
    case "property":
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

function commitAttribute(binding, value) {
  const attrName = binding.attrName || binding.name;
  if (value == null || value === false) {
    binding.node.removeAttribute(attrName);
  } else {
    // Replace the marker in the current attribute value
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

function commitNode(binding, value, prevValue) {
  const { node } = binding;

  // Clean up previous nodes if any
  if (binding._nodes) {
    for (const n of binding._nodes) n.remove();
    binding._nodes = null;
  }

  if (value == null || value === false) {
    // render nothing
    binding._nodes = [];
  } else if (value instanceof TemplateResult) {
    const frag = renderToFragment(value);
    const nodes = Array.from(frag.childNodes);
    node.parentNode.insertBefore(frag, node);
    binding._nodes = nodes;
  } else if (Array.isArray(value)) {
    const frag = document.createDocumentFragment();
    const nodes = [];
    for (const item of value) {
      if (item instanceof TemplateResult) {
        const f = renderToFragment(item);
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
    // Primitive — text node
    const t = document.createTextNode(String(value));
    node.parentNode.insertBefore(t, node);
    binding._nodes = [t];
  }
}

function renderToFragment(templateResult) {
  const { strings, values } = templateResult;
  const { tpl, parts } = buildTemplate(strings);

  const clone = tpl.content.cloneNode(true);
  const bindings = walkTemplate(clone, parts);

  for (const binding of bindings) {
    const idx = binding.index;
    commitValue(binding, values[idx], undefined);
  }

  return clone;
}

