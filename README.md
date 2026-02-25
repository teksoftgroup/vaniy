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
