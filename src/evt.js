"use strict";

const EVT = {
  listeners: new Map(),
  sub: function (name, callback) {
    let handlers = this.listeners.get(name);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(name, handlers);
    }
    handlers.add(callback);
  },
  once: function (name, callback) {
    const onceCallback = (...args) => {
      callback(...args);
      this.unsub(name, onceCallback);
    };
    this.sub(name, onceCallback);
  },
  unsub: function (name, cb) {
    let handlers = this.listeners.get(name);
    if (!handlers) return;
    handlers.delete(cb);
  },
  pub: function (name, ...data) {
    let handlers = this.listeners.get(name);
    if (!handlers) return;
    handlers.forEach((cb) => {
      try {
        cb(...data);
      } catch (e) {
        console.error(`Error in event "${name}" listener: `, e);
      }
    });
  },
  has: function (name) {
    return this.listeners.has(name) && this.listeners.get(name).size > 0;
  },
  clear: function (name) {
    if (name) {
      this.listeners.delete(name);
    } else {
      this.listeners.clear();
    }
  },
  ping: () => console.log("PONG!"),
  description: "EVT is for Event publishing and emitting",
};

export default EVT;
