"use strict";

/**
 * Mount a function component into a target element.
 *
 * A component is a plain function: (props, ctx) => tag() builder | null
 * It encapsulates its own state (signals), logic, and template in one place.
 *
 * ctx provides:
 *   ctx.onMount(fn)        — called (with the instance) after the component
 *                            is rendered into the DOM
 *   ctx.onCleanup(fn)      — register a cleanup (run on destroy)
 *   ctx.emit(event, data)  — emit a named event to external subscribers
 *
 * The returned instance provides:
 *   inst.el                — Q-wrapped root element (null if nothing rendered)
 *   inst.props             — props passed at mount time
 *   inst.on(event, fn)     — subscribe to a component event; returns unsub fn
 *   inst.off(event, fn)    — unsubscribe
 *   inst.destroy()         — run cleanups, remove DOM, clear subscriptions
 *
 * @param {Function}           componentFn  — (props, ctx) => builder | null
 * @param {string|HTMLElement} target       — CSS selector or DOM node
 * @param {Object}             [props={}]   — read-only props for the component
 * @returns {{ el, props, on, off, destroy }}
 *
 * @example
 * function Counter(props, ctx) {
 *   const count = signal(0);
 *   let spanEl;
 *
 *   ctx.onMount((inst) => {
 *     return bindText(spanEl, count); // returned fn auto-registered as cleanup
 *   });
 *
 *   return tag('div').child(
 *     tag('span').ref(el => (spanEl = el)),
 *     tag('button').text('+').on('click', () => {
 *       count.val++;
 *       ctx.emit('change', count.val);
 *     }),
 *   );
 * }
 *
 * const inst = mount(Counter, '#app', { label: 'My Counter' });
 * inst.on('change', (val) => console.log('count:', val));
 * inst.destroy();
 */
export function mount(componentFn, target, props = {}) {
  const listeners = new Map();
  const mountCallbacks = [];
  const cleanupFns = [];

  const ctx = {
    /**
     * Register a callback to run after the component is rendered into the DOM.
     * The callback receives the component instance. Returning a function or
     * array of functions auto-registers them as cleanup — no need to call
     * ctx.onCleanup() for reactive bindings set up inside onMount.
     * @param {Function} fn - (instance) => void | Function | Function[]
     */
    onMount(fn) {
      mountCallbacks.push(fn);
    },

    /**
     * Register a cleanup function to run when the component is destroyed.
     * Use this to stop effects, unsubscribe from signals, or clear timers.
     * @param {Function} fn
     */
    onCleanup(fn) {
      cleanupFns.push(fn);
    },

    /**
     * Emit a named event to all subscribers registered via inst.on().
     * @param {string} event
     * @param {*}      data
     */
    emit(event, data) {
      listeners.get(event)?.forEach((fn) => fn(data));
    },
  };

  // Call the component function — sets up state/logic and returns the template
  const template = componentFn(props, ctx);

  // Collect cleanups created during render (e.g. from .classIf(), .prop())
  const renderCleanups = [];

  const instance = {
    /** Q-wrapped root element. Null if the component renders nothing. */
    el: template ? template.render(target, renderCleanups) : null,

    /** Props passed at mount time. */
    props,

    /**
     * Subscribe to a named event emitted by this component via ctx.emit().
     * Returns an unsubscribe function.
     * @param {string}   event
     * @param {Function} fn
     * @returns {Function} unsubscribe
     */
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },

    /**
     * Unsubscribe from a named event.
     * @param {string}   event
     * @param {Function} fn
     */
    off(event, fn) {
      listeners.get(event)?.delete(fn);
    },

    /**
     * Destroy the component: run all registered cleanups, remove the root
     * element from the DOM, and clear all event subscriptions.
     */
    destroy() {
      cleanupFns.forEach((fn) => fn());
      instance.el?.elt?.remove();
      instance.el = null;
      listeners.clear();
    },
  };

  // Register render-time cleanups (from .classIf(), .prop(), .bindList())
  cleanupFns.push(...renderCleanups);

  // Call onMount now that the DOM is ready. Returning a function or array of
  // functions from the callback auto-registers them as cleanups.
  mountCallbacks.forEach((fn) => {
    const result = fn(instance);
    if (typeof result === "function") {
      cleanupFns.push(result);
    } else if (Array.isArray(result)) {
      result.forEach((f) => { if (typeof f === "function") cleanupFns.push(f); });
    }
  });

  return instance;
}
