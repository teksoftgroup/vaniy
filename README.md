# Vaniy

A lightweight, modular JavaScript utility library for common web development tasks.
Vaniy is how we say vanilla in my language.

## Features

- **DOM Manipulation** - jQuery-like chainable API for element selection and manipulation
- **HTTP Client** - Full-featured HTTP client with caching, interceptors, and file upload/download
- **Event System** - Pub/Sub event emitter for decoupled communication
- **Form Handling** - Validation engine with error rendering
- **Reactivity** - Fine-grained signals, effects, computed values, and batching
- **DOM Bindings** - Declaratively bind signals to DOM elements
- **UI Builder** - Fluent, framework-agnostic element builder with reactive list binding and themeable presets
- **Components** - Encapsulated, mountable UI units with their own state, template, and lifecycle
- **Query Cache** - Configurable async data cache with signals, polling, and DOM bindings
- **Zero Dependencies** - Pure vanilla JavaScript

## Installation

```bash
npm install vaniy
```

## Quick Start

```javascript
import { Q, HTTP, EVT, V } from "vaniy";

// DOM manipulation
Q("#button").text("Click me").addClass("primary");

// HTTP requests
const data = await HTTP.get("/api/users");

// Event system
EVT.sub("user:login", (user) => console.log(user));
EVT.pub("user:login", { name: "John" });

// Form validation
const { isValid, errors } = V.run(
  { email: ["required", "email"] },
  { email: "test@example.com" },
);
```

## Modules

### DOM

Select and manipulate DOM elements with a chainable API.

```javascript
import { Q, all, make, makeId, parseHtml, onPageLoad } from "vaniy";

// Select single element
Q("#header").text("Hello World").addClass("visible");

// Get/set values
Q("#input").val();
Q("#container").html("<p>New content</p>");

// Classes
Q(".box").addClass("active").removeClass("hidden");

// Styles
Q("#element").css({ color: "red", fontSize: "16px" });

// Events
Q("#button").on("click", () => console.log("Clicked!"));

// Select multiple elements
all(".items").forEach((el) => el.classList.add("loaded"));

// Create elements
const div = make("div");

// Generate random ID
const id = makeId(8); // "a1b2c3d4"

// Parse HTML string
const nodes = parseHtml("<div>Content</div>");

// DOM ready
onPageLoad(() => console.log("DOM loaded"));
```

### HTTP

**Caching shorthand codes:**

| Rule  | Description                    |
| ----- | ------------------------------ |
| `CFL` | cache-first + localStorage     |
| `CFS` | cache-first + sessionStorage   |
| `CFM` | cache-first + memory           |
| `NFL` | network-first + localStorage   |
| `NFS` | network-first + sessionStorage |
| `NFM` | network-first + memory         |

HTTP client with caching, interceptors, and progress tracking.

```javascript
import { HTTP, get, post, upload, download } from "vaniy";

// Configure base URL and timeout
HTTP.base("https://api.example.com").timeout(10000);

// Request interceptors
HTTP.interceptRequest((config) => {
  config.headers["Authorization"] = "Bearer token";
  return config;
});

// Response interceptors
HTTP.interceptResponse((response) => {
  console.log("Response:", response);
  return response;
});

// GET request
const users = await HTTP.get("/users");

// POST request
await HTTP.post("/users", { name: "John", email: "john@example.com" });

// PUT request
await HTTP.put("/users/1", { name: "John Updated" });

// DELETE request
await HTTP.delete("/users/1");

// With caching
const data = await HTTP.get("/data", {
  cache: {
    strategy: "cache-first", // or 'network-first'
    storage: "localStorage", // or 'sessionStorage', 'memory'
    ttl: 60000, // Time to live in ms
  },
});

// Or with cache helper see table below for options
const data = await HTTP.get("/data", cache("CFL 1min"));

// This will default to CFL
const data = await HTTP.get("/data", cache("1min"));

// This will default to CFL 1min
const data = await HTTP.get("/data", cache(""));

// This will also default to CFL 1min
const data = await HTTP.get("/data", cache());

// File upload with progress
await HTTP.upload("/upload", fileInput.files[0], {
  onProgress: (sent, total, percent) => {
    console.log(`${percent}% uploaded`);
  },
});

// File download with progress
await HTTP.download("/files/doc.pdf", {
  onProgress: (received, total, percent) => {
    console.log(`${percent}% downloaded`);
  },
});
```

### Events

Pub/Sub event system for decoupled communication.

```javascript
import { EVT } from "vaniy";

// Subscribe to event
EVT.sub("user:login", (user) => {
  console.log("User logged in:", user);
});

// Subscribe once (auto-unsubscribe after first call)
EVT.once("init", () => {
  console.log("Initialized");
});

// Publish event
EVT.pub("user:login", { id: 1, name: "John" });

// Unsubscribe
const handler = (data) => console.log(data);
EVT.sub("event", handler);
EVT.unsub("event", handler);

// Check if event has listeners
EVT.has("user:login"); // true

// Clear all listeners for an event
EVT.clear("user:login");

// Clear all listeners
EVT.clear();
```

### Validator

Form validation with built-in rules.

```javascript
import { V } from "vaniy";

const schema = {
  email: ["required", "email"],
  password: ["required", "min:8", "max:100"],
  birthdate: ["required", "date"],
  amount: ["required", "currency"],
};

const formData = {
  email: "test@example.com",
  password: "secret123",
  birthdate: "1990-01-15",
  amount: "$1,234.56",
};

const { isValid, errors } = V.run(schema, formData);

if (!isValid) {
  console.log(errors);
  // { password: ['Must be at least 8 characters'] }
}
```

**Built-in Rules:**

| Rule                   | Description                                 |
| ---------------------- | ------------------------------------------- |
| `required`             | Field must not be empty                     |
| `requiredIf:condition` | Field must not be empty if condition is met |
| `email`                | Valid email format                          |
| `min:n`                | Minimum string length                       |
| `max:n`                | Maximum string length                       |
| `date`                 | Valid YYYY-MM-DD format                     |
| `currency`             | Valid currency format                       |
| `same:field`           | Current field must match specified field    |
| `in:list`              | Field value must be in the list             |

### Form Handler

Complete form handling with validation and error rendering.

```javascript
import { useFormHandler, FormHandler, FormErrorRenderer } from "vaniy";

// Quick setup with useFormHandler
const schema = {
  email: ["required", "email"],
  password: ["required", "min:8"],
};

const form = useFormHandler("myFormId", schema, (formData) => {
  // Called on successful validation
  console.log("Submit:", formData);
});

// Manual validation
form.validate();

// Reset form and errors
form.reset();

// Set custom error container
form.setContainer("email", document.querySelector("#email-errors"));

// Cleanup
form.destroy();
```

**Form Events:**

| Event                 | Description               |
| --------------------- | ------------------------- |
| `form:state:change`   | Form data changed         |
| `form:errors:change`  | Validation errors changed |
| `form:submit:success` | Successful submission     |
| `form:submit:error`   | Validation failed         |
| `form:reset`          | Form was reset            |
| `form:validated`      | Validation completed      |

### Reactivity

Fine-grained reactive primitives — signals, effects, computed values, and batching.

```javascript
import { signal, effect, computed, batch, when } from "vaniy";
```

**`signal(initial)`**

Holds a reactive value. Reading `.val` inside an `effect` tracks the dependency; writing `.val` triggers all dependents.

```javascript
const count = signal(0);

count.val;           // read → 0
count.val = 1;       // write → triggers effects
count.peek();        // read without tracking
String(count);       // "1"  (toString)
count + 0;           // 1    (valueOf)

// Subscribe manually
const unsub = count.subscribe(() => console.log(count.val));
unsub(); // stop
```

**`effect(fn)`**

Runs `fn` immediately and re-runs it whenever any signal read inside it changes.

```javascript
const name = signal("Alice");

effect(() => {
  console.log("Name:", name.val); // runs now and on every change
});

name.val = "Bob"; // → logs "Name: Bob"
```

**`computed(fn)`**

Derives a read-only signal from other signals.

```javascript
const price = signal(10);
const qty   = signal(3);
const total = computed(() => price.val * qty.val);

console.log(total.val); // 30

price.val = 20;
console.log(total.val); // 60
```

**`batch(fn)`**

Groups multiple signal writes so effects only run once after all updates.

```javascript
const x = signal(1);
const y = signal(2);

effect(() => console.log(x.val, y.val)); // logs: 1 2

batch(() => {
  x.val = 10;
  y.val = 20;
  // effect has not run yet
});
// effect runs once here → logs: 10 20
```

**`when(signal, fn)`**

Runs `fn` whenever `signal.val` is truthy, passing the current value.

```javascript
const user = signal(null);

when(user, (u) => console.log("Logged in:", u.name));

user.val = { name: "Alice" }; // → logs "Logged in: Alice"
```

### DOM Bindings

Declaratively bind signals to DOM elements. Each function returns the underlying `effect` — call it to stop the binding.

```javascript
import { bind, bindText, bindHtml, bindValue, bindList, bindOptions, bindClass, bindAttr } from "vaniy";
```

All functions accept a CSS selector string or a `Q`-wrapped element as `target`.

**`bind(target, prop, signal)`**

Syncs a signal to a named property on an element.

| `prop` | Behavior |
| --- | --- |
| `"text"` | Sets element text content |
| `"html"` | Sets element inner HTML |
| `"value"` | Sets input value |
| `"show"` | Shows element when truthy, hides when falsy |
| `"hide"` | Hides element when truthy, shows when falsy |
| `"disabled"` | Sets `disabled` attribute |
| anything else | Assigned directly as `element[prop]` |

```javascript
const username = signal("Alice");
const isAdmin  = signal(false);
const bio      = signal("<p>Hello</p>");

bind("#name", "text", username);
bind("#bio", "html", bio);
bind("#role-badge", "show", isAdmin);
bind("#submit", "disabled", isAdmin);

username.val = "Bob"; // → #name text updates instantly
```

**`bindText(target, signal)`**

Shorthand for `bind(target, "text", signal)`.

```javascript
const title = signal("Hello");
bindText("#heading", title);

title.val = "World"; // → #heading text content updates
```

**`bindHtml(target, signal)`**

Shorthand for `bind(target, "html", signal)`.

```javascript
const content = signal("<p>Loading...</p>");
bindHtml("#panel", content);

content.val = "<p>Done</p>"; // → #panel innerHTML updates
```

**`bindValue(target, signal)`**

Shorthand for `bind(target, "value", signal)`.

```javascript
const query = signal("");
bindValue("#search", query);

query.val = "vaniy"; // → #search input value updates
```

**`bindList(target, signal, template, empty?)`**

Renders an array signal as a list. Re-renders the entire list on every change.

```javascript
const users = signal([]);

const stop = bindList(
  "#user-list",
  users,
  (user) => `<li>${user.name}</li>`,
  "<li>No users found.</li>",  // optional fallback for empty/null
);

users.val = [{ name: "Alice" }, { name: "Bob" }];
// → #user-list innerHTML: <li>Alice</li><li>Bob</li>
```

**`bindOptions(target, signal, opts?)`**

Populates a `<select>` element from an array signal.

```javascript
const roles = signal([]);

bindOptions("#role-select", roles, {
  value: "id",           // item property used as <option value> (default: "id")
  label: "name",         // item property used as <option> text  (default: "name")
  placeholder: "Pick a role", // first empty option text (default: "Select ...")
});

roles.val = [
  { id: 1, name: "Admin" },
  { id: 2, name: "Editor" },
];
```

**`bindClass(target, className, signal)`**

Adds a class when the signal is truthy, removes it when falsy.

```javascript
const isActive = signal(false);

bindClass("#card", "active", isActive);

isActive.val = true;  // → adds class "active"
isActive.val = false; // → removes class "active"
```

**`bindAttr(target, attr, signal)`**

Sets an HTML attribute to the signal's value on every change.

```javascript
const progress = signal(0);

bindAttr("#bar", "aria-valuenow", progress);

progress.val = 75; // → <div id="bar" aria-valuenow="75">
```

### Components

Self-contained UI units that own their DOM, state, and lifecycle. Sit naturally below a `definePage` and above raw `tag()` builders.

```javascript
import { defineComponent, tag, signal, bindText } from "vaniy";
```

#### `defineComponent(config)`

Defines a reusable component. Returns a definition object with a single `mount()` method.

```javascript
const Counter = defineComponent({
  // 1. Create signals and state — runs before template
  setup() {
    this.count = signal(this.props.initial ?? 0);
  },

  // 2. Build the DOM — return a tag() builder
  template() {
    return tag("div").css("counter").child(
      tag("span"),                              // el for the count display
      tag("button").text("+").on("click", () => this.count.val++),
      tag("button").text("−").on("click", () => this.count.val--),
    );
  },

  // 3. DOM is ready — bind signals and attach reactive behavior
  onMount() {
    const stop = bindText(this.el.elt.querySelector("span"), this.count);
    this.onCleanup(stop);  // stop the effect when destroyed
  },

  // 4. Optional: called first when destroy() runs, before cleanups
  onDestroy() {
    console.log("Counter unmounted");
  },

  // 5. Optional: methods available on the instance
  methods: {
    reset() { this.count.val = 0; },
  },
});
```

**Mounting:**

```javascript
// mount(target, props?) — target is a CSS selector or DOM node
const counter = Counter.mount("#app", { initial: 10 });

// instance.el   — Q-wrapped root element
// instance.props — the props passed at mount time
counter.el.elt;        // raw HTMLElement
counter.props.initial; // 10
counter.reset();       // call a method
```

**Lifecycle order:**

| Phase | Hook | When |
| --- | --- | --- |
| 1 | `setup()` | Signals and state init |
| 2 | `template()` | Build and render DOM |
| 3 | `onMount()` | DOM ready — bind signals, attach events |
| 4 | `onDestroy()` | First call in `destroy()` |
| — | cleanups | Registered `onCleanup` functions, in order |
| — | DOM removal | Root element removed from the DOM |

**`this.onCleanup(fn)`** — register any teardown to run on `destroy()`:

```javascript
onMount() {
  // stop a reactive binding
  const stopBind = bindText(this.el, this.title);
  this.onCleanup(stopBind);

  // cancel a timer
  const timer = setInterval(() => this.tick(), 1000);
  this.onCleanup(() => clearInterval(timer));

  // unsubscribe from a signal
  const unsub = someSignal.subscribe(() => { ... });
  this.onCleanup(unsub);
}
```

**`instance.destroy()`** — unmounts the component: runs `onDestroy`, executes all cleanups, removes the root element from the DOM:

```javascript
const modal = Modal.mount("#overlay", { title: "Confirm" });
// ...later:
modal.destroy(); // DOM removed, effects stopped, timers cleared
```

**Usage inside a page:**

```javascript
import { definePage, mountPage, defineComponent } from "vaniy";
import { UserCard } from "./components/user-card.js";

mountPage(definePage({
  root: "#app",
  setup() {
    this.card = UserCard.mount(this.refs._.sidebar.elt, { name: "Alice" });
  },
  cleanup() {
    this.card.destroy();
  },
}));
```

**Multiple independent instances from one definition:**

```javascript
const Tag = defineComponent({
  template() { return tag("span").css("tag").text(this.props.label); },
});

Tag.mount("#tags", { label: "JavaScript" });
Tag.mount("#tags", { label: "Vanilla" });
Tag.mount("#tags", { label: "No dependencies" });
```

### UI Builder

A fluent, chainable DOM element builder with support for reactive list binding and CSS-framework-agnostic theming via `createPresets`.

```javascript
import { tag, createPresets } from "vaniy";
```

#### `tag(tagName)`

Creates a builder for any HTML element. All methods return the builder for chaining. Call `.render()` to produce the real DOM node (wrapped in a `Q` object).

```javascript
// Build and render a button
const btn = tag("button")
  .text("Save")
  .css("btn btn-primary")
  .on("click", () => console.log("saved"))
  .render("#app"); // appends to #app and returns Q-wrapped element

// Build a card with children
tag("div")
  .css("card")
  .child(
    tag("h2").text("Title"),
    tag("p").text("Body copy"),
  )
  .render("#app");
```

**Builder methods:**

| Method | Description |
| --- | --- |
| `.text(str)` | Set `textContent` |
| `.html(str)` | Set `innerHTML` |
| `.css(classes)` | Set the `class` attribute |
| `.attr(key, value)` | Set an arbitrary attribute |
| `.data(key, value)` | Set a `data-*` attribute |
| `.on(event, fn)` | Attach a DOM event listener |
| `.child(...builders)` | Append child builders or DOM elements |
| `.when(condition)` | Render only when `condition` is truthy; no-op otherwise |
| `.bindList(sig, itemFn, empty?)` | Reactively render a signal array as children |
| `.render(target?)` | Build the element, optionally mount to a selector or DOM node |

**`.when(condition)`** — conditionally include an element without breaking the chain:

```javascript
tag("span")
  .text("Admin only")
  .when(user.isAdmin) // returns noop builder if false; render() → null
  .render("#app");
```

**`.bindList(signal, itemFn, empty?)`** — reactively render an array signal as children. Re-renders automatically when the signal changes:

```javascript
import { signal } from "vaniy";

const todos = signal([]);

tag("ul")
  .bindList(
    todos,
    (todo, i) => tag("li").text(`${i + 1}. ${todo.title}`),
    "<li>No todos yet.</li>", // shown when list is empty
  )
  .render("#app");

todos.val = [{ title: "Buy milk" }, { title: "Write tests" }];
// → <ul><li>1. Buy milk</li><li>2. Write tests</li></ul>
```

#### `createPresets(theme)`

Returns a set of pre-built component factories driven by a theme object that maps token names to CSS class strings. Works with any CSS framework (Tailwind, Bootstrap, plain CSS, etc.).

```javascript
// Tailwind theme
const ui = createPresets({
  btnBase:        "font-medium px-6 py-2.5 rounded-full text-sm transition-colors",
  "btn.default":  "bg-blue-600 text-white hover:bg-blue-700",
  "btn.danger":   "bg-red-600 text-white hover:bg-red-700",
  pill:           "inline-block text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full",
  fieldLabel:     "block text-xs font-medium text-gray-600 mb-1",
  fieldInput:     "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm",
  fieldRequired:  "text-red-400",
  fieldOptional:  "text-gray-400 font-normal",
  fieldWrap:      "",
  fieldWrapSpan2: "sm:col-span-2",
  sectionLabel:   "text-xs font-medium text-gray-500 uppercase tracking-wide mb-2",
  select:         "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm",
  list:           "space-y-1",
  listItem:       "px-3 py-2 hover:bg-gray-100 cursor-pointer rounded",
});
```

**Available presets:**

**`ui.btn(text, onClick, variant?)`** — button with optional style variant (defaults to `"default"`):

```javascript
ui.btn("Save", () => save(), "default").render("#toolbar");
ui.btn("Delete", () => remove(), "danger").render("#toolbar");
```

**`ui.pill(text, url)`** — badge / tag link:

```javascript
ui.pill("JavaScript", "/tags/js").render("#tags");
```

**`ui.field(label, type, opts?)`** — labelled form field (label + input wrapped in a div):

```javascript
ui.field("Email", "email").render("#form");
ui.field("Bio", "text", { required: false, span2: true, placeholder: "Tell us about yourself" }).render("#form");
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `required` | `boolean` | `true` | Show required `*` or `(optional)` marker |
| `span2` | `boolean` | `false` | Use `fieldWrapSpan2` class instead of `fieldWrap` |
| `value` | `string` | `""` | Pre-fill input value |
| `name` | `string` | `""` | Input `name` attribute |
| `placeholder` | `string` | `""` | Input placeholder |
| `extraCss` | `string` | `""` | Extra classes appended to the input |

**`ui.select(options, onChange)`** — styled `<select>` dropdown:

```javascript
ui.select(
  [{ label: "Admin", value: "admin" }, { label: "Editor", value: "editor" }],
  (value) => console.log("selected:", value),
).render("#form");
```

**`ui.list(items, onSelect)`** — clickable `<ul>` list:

```javascript
ui.list(
  [{ label: "Alice" }, { label: "Bob" }],
  (item) => console.log("clicked:", item.label),
).render("#sidebar");
```

**`ui.sectionLabel(text, required?)`** — section heading with optional required marker:

```javascript
ui.sectionLabel("Contact Info").render("#form");
ui.sectionLabel("Billing Address", true).render("#form");
```

### Query Cache

Async data cache with deduplication, stale-while-revalidate, persistence, and reactive signals.

Use `createQuery` to create a fully configured client. `queryClient` is a zero-config default export for quick use.

```javascript
import { createQuery, queryClient } from "vaniy";

// Create your own configured client
const client = createQuery({
  persistKey: "my-app-cache",   // localStorage key (default: "query-cache")
  persistedKeys: ["user", "settings"], // cache key prefixes to persist (default: null = none)
  defaultTtl: 60000,            // entry lifetime in ms (default: 60000)
  defaultStaleTime: 5000,       // freshness window in ms (default: 5000)
  defaultRetries: 3,            // retry attempts on failure (default: 3)
  defaultRetryDelay: 1000,      // base retry delay in ms, doubles each attempt (default: 1000)
});
```

**Core cache methods:**

```javascript
// Fetch and cache data
const data = await client.query("users", () => fetch("/api/users").then(r => r.json()));

// Per-query overrides
const data = await client.query("users", fetcher, { ttl: 30000, staleTime: 0 });

// Set data manually (e.g. after a mutation)
client.setQueryData("users", updatedList);

// Optimistic update — returns previous value
const previous = client.mutate("users", (prev) => [...prev, newUser]);

// Invalidate (remove from cache)
client.invalidate("users");

// Invalidate and immediately refetch
client.invalidate("users", { refetch: true, fetcher });

// Invalidate all keys matching a pattern
client.invalidateMatching((key) => key.startsWith("users"));

// Prefetch into cache without blocking
client.prefetch("users", fetcher);

// Read cache entry directly
const entry = client.getEntry("users"); // { data, staleAt, expiry, error, promise }

// Subscribe to cache updates for a key
const unsub = client.subscribe("users", (entry) => console.log(entry?.data));

// Clear all cache and storage
client.clear();
```

**Polling:**

```javascript
// Start polling every 5 seconds — returns a stop function
const stop = client.startPolling("price", fetcher, 5000);

// Stop a specific poll
client.stopPolling("price");

// Stop all active polls
client.stopAllPolling();
```

**Reactive signals (`querySignal`):**

Wraps a query in reactive signals — ideal for use with Vaniy's reactive system.

```javascript
const { data, loading, error, fetch, refetch, mutate, unsubscribe } =
  client.querySignal("users", () => fetch("/api/users").then(r => r.json()));

// data.val, loading.val, error.val update automatically
console.log(data.val);    // fetched array or null
console.log(loading.val); // true while fetching
console.log(error.val);   // Error instance or null

// Skip auto-fetch, call manually
const qs = client.querySignal("users", fetcher, { enabled: false });
await qs.fetch();

// Refetch (invalidates then fetches)
await qs.refetch();

// Optimistic update
qs.mutate((prev) => [...prev, newUser]);

// Stop listening
qs.unsubscribe();
```

**Polling signals (`pollingSignal`):**

```javascript
const { data, loading, error, stop } =
  client.pollingSignal("price", fetcher, 5000);

// stop polling
stop();
```

**DOM binding (`bindQuery`):**

Automatically renders data into a DOM element when the cache updates.

```javascript
client.bindQuery("users", fetcher, {
  target: "#user-list",              // CSS selector or element reference
  render: (data) => data.map(u => `<li>${u.name}</li>`).join(""),
  onLoading: (el) => el.innerHTML = "Loading...",
  onError: (err, staleData, el) => el.innerHTML = "Failed to load",
});

// With polling — returns a stop function
const stop = client.bindQuery("users", fetcher, {
  target: "#user-list",
  render: (data) => data.map(u => `<li>${u.name}</li>`).join(""),
  poll: 10000,
});
```

**Query events (via `EVT`):**

| Event | Description |
| ----- | ----------- |
| `query:fetch` | Fetch started |
| `query:success` | Fetch succeeded |
| `query:error` | Fetch failed |
| `query:retry` | Fetch retrying |
| `query:mutate` | Cache mutated |
| `query:set` | Cache set manually |
| `query:invalidate` | Entry invalidated |
| `query:hydrated` | Cache loaded from storage |
| `query:gc` | Expired entries collected |
| `query:cleared` | All cache cleared |

Each event also fires as `query:<key>:<event>` for key-specific subscriptions.

### Template Helpers

Small composable functions for building HTML strings from data — useful inside `bindHtml`/`bindList` templates or anywhere you're hand-rolling markup.

```javascript
import { each, when, options, select, radios, rows, optgroups, ol, csv, esc } from "vaniy";
```

**`each(list, separator?)(template)`**

Maps a list through a `template(item, index)` function and joins the results. `null`/`undefined` lists are treated as empty. This is the building block the other helpers below are made of.

```javascript
each([1, 2, 3], ",")((n) => `n${n}`); // "n1,n2,n3"
each(["a", "b"])((s) => `[${s}]`); // "[a][b]"
```

**`when(condition, template)`**

Returns `template` when `condition` is truthy, otherwise `""`. Handy for conditionally including a chunk of markup inline.

```javascript
`<ul>${when(items.length, "<li>Has items</li>")}</ul>`;
```

**`options(list, valueKey, labelKey)`**

Renders an `<option>` per item.

```javascript
options(
  [
    { id: 1, name: "One" },
    { id: 2, name: "Two" },
  ],
  "id",
  "name",
);
// '<option value="1">One</option><option value="2">Two</option>'
```

**`select(list, valueKey, labelKey, placeholder?)`**

Like `options`, with a placeholder `<option>` prepended. Used internally by `bindOptions`.

```javascript
select([{ id: 1, name: "One" }], "id", "name");
// '<option value="">Choose...</option><option value="1">One</option>'
```

**`radios(list, name)`**

Renders a radio-button `<label>` per item, sharing the same `name` attribute. Items are expected to have `id` and `label` properties.

```javascript
radios(
  [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  "letter",
);
// '<label><input type="radio" name="letter" value="a">A</label><label><input type="radio" name="letter" value="b">B</label>'
```

**`rows(list, keys)`**

Renders a `<tr>` per item with a `<td>` for each key in `keys`.

```javascript
rows([{ id: 1, name: "Alice" }], ["id", "name"]);
// "<tr><td>1</td><td>Alice</td></tr>"
```

**`optgroups(groups)`**

Renders an `<optgroup>` per group, with each group's `items` rendered as `<option>`s via `options`. Groups are expected to have `label` and `items` properties.

```javascript
optgroups([{ label: "Fruits", items: [{ id: 1, name: "Apple" }] }]);
// '<optgroup label="Fruits"><option value="1">Apple</option></optgroup>'
```

**`ol(list)`**

Renders a numbered `<li value="...">` per item, joined with newlines.

```javascript
ol(["First", "Second"]);
// '<li value="1">First</li>\n<li value="2">Second</li>'
```

**`csv(list)`**

Joins each item's `name` property with `", "`.

```javascript
csv([{ name: "Alice" }, { name: "Bob" }]); // "Alice, Bob"
```

**`esc(value)`**

Escapes `& < > " '` for safe interpolation into HTML. Use it to sanitize untrusted strings before they go into any of the template helpers above.

```javascript
esc(`<script>alert("x")</script>`);
// "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
```

### Utilities

Additional helper functions.

```javascript
import {
  isValidRoutingNumber,
  toCurrency,
  formatByCountry,
  redirect,
  isFocus,
  isArray,
  isArrayEmpty,
} from "vaniy";

// Validate US bank routing number
isValidRoutingNumber("021000021"); // true

// Format as currency
toCurrency(1234.56); // "$1,234.56"
toCurrency(1234.56, { locale: "de-DE", currency: "EUR" }); // "1.234,56 €"

// Format by country code
formatByCountry(1234.56, "GB"); // "£1,234.56"

// Redirect to URL
redirect("/dashboard");

// Check if element has focus
isFocus(document.querySelector("#input"));

// Array utilities
isArray([1, 2, 3]); // true
isArrayEmpty([]); // true
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Run tests once
npm run test:run

# Build for production
npm run build

# Preview production build
npm run preview
```

## Build Output

The build generates two bundle formats:

- `dist/vaniy.es.js` - ES module
- `dist/vaniy.umd.js` - UMD bundle

Both include sourcemaps for debugging.

## License

MIT

## Author

TekSoftGroup
