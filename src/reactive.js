let _tracking = null;
let _batching = null;
let _pending = new Set();

export function signal(initial) {
  let _val = initial;
  const subs = new Set();

  const s = {
    get val() {
      if (_tracking) subs.add(_tracking);
      return _val;
    },
    set val(v) {
      if (v === _val) return;
      _val = v;
      for (const fn of subs) fn();
    },
    peek: () => _val,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    toString: () => String(_val),
    valueOf: () => _val,
  };
  return s;
}

export function effect(fn) {
  const run = () => {
    const prev = _tracking;
    _tracking = run;
    try {
      fn();
    } finally {
      _tracking = prev;
    }
  };
  run();
  return run;
}

export function computed(fn) {
  const s = signal(undefined);
  effect(() => {
    s.val = fn();
  });
  return s;
}

export function batch(fn) {
  _batching = true;
  fn();
  _batching = false;
  _pending.forEach((f) => f());
  _pending.clear();
}

export function when(sig, fn) {
  return effect(() => {
    if (sig.val) fn(sig.val);
  });
}
