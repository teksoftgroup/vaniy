# Vaniy

A lightweight, modular JavaScript utility library for common web development tasks.
Vaniy is how we say vanilla in my language.

## Features

- **DOM Manipulation** - jQuery-like chainable API for element selection and manipulation
- **HTTP Client** - Full-featured HTTP client with caching, interceptors, and file upload/download
- **Event System** - Pub/Sub event emitter for decoupled communication
- **Form Handling** - Validation engine with error rendering
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

| Rule       | Description             |
| ---------- | ----------------------- |
| `required` | Field must not be empty |
| `email`    | Valid email format      |
| `min:n`    | Minimum string length   |
| `max:n`    | Maximum string length   |
| `date`     | Valid YYYY-MM-DD format |
| `currency` | Valid currency format   |

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
