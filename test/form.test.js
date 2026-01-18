import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Import the module under test
import {
  FormEvents,
  FormHandler,
  FormErrorRenderer,
  useFormHandler,
} from "../src/form.js";

// We'll spy on EVT.pub / EVT.sub / EVT.unsub and mock V.run
import EVT from "../src/evt.js";
import V from "../src/validator.js";

function setFormDOM() {
  document.body.innerHTML = `
    <form id="myForm">
      <input name="email" value="a@b.com" />
      <input name="name" value="Pascal" />
      <button type="submit">Submit</button>
    </form>

    <div id="customEmailErrors"></div>
  `;
}

describe("form.js", () => {
  let pubSpy;
  let subSpy;
  let unsubSpy;

  beforeEach(() => {
    setFormDOM();
    EVT.clear();

    pubSpy = vi.spyOn(EVT, "pub");
    subSpy = vi.spyOn(EVT, "sub");
    unsubSpy = vi.spyOn(EVT, "unsub");

    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FormHandler initializes, captures initial values, and publishes initial state", () => {
    vi.spyOn(V, "run").mockReturnValue({ isValid: true, errors: {} });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", { any: "schema" }, onSubmit);

    expect(h.getFormState()).toEqual({
      email: "a@b.com",
      name: "Pascal",
    });
    expect(h.getErrors()).toEqual({});

    // should publish STATE_CHANGE at init
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.STATE_CHANGE, {
      formId: "myForm",
      state: { email: "a@b.com", name: "Pascal" },
    });
  });

  it("FormHandler logs an error if form not found and does not throw", () => {
    document.body.innerHTML = `<div>No form</div>`;
    const onSubmit = vi.fn();

    expect(() => new FormHandler("missingForm", {}, onSubmit)).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it("handleInput updates state and publishes state; clears field error if present", () => {
    vi.spyOn(V, "run").mockReturnValue({ isValid: true, errors: {} });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", {}, onSubmit);

    // Pretend errors exist (e.g. from a failed submit)
    h.errors = { email: ["Email is required"] };

    const emailInput = document.querySelector('input[name="email"]');
    emailInput.value = "new@b.com";

    emailInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(h.getFormState().email).toBe("new@b.com");

    // publishes state on input
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.STATE_CHANGE, {
      formId: "myForm",
      state: { email: "new@b.com", name: "Pascal" },
    });

    // clears error and publishes ERRORS_CHANGE
    expect(h.getErrors().email).toBeUndefined();
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: {},
    });
  });

  it("submit success: validates, publishes VALIDATED and SUBMIT_SUCCESS, clears errors, calls onSubmit", () => {
    vi.spyOn(V, "run").mockReturnValue({ isValid: true, errors: {} });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", { schema: true }, onSubmit);

    const form = document.getElementById("myForm");
    const preventDefault = vi.fn();

    form.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    // JSDOM SubmitEvent doesn't expose preventDefault spy easily here; handler calls preventDefault internally.
    // So we validate via effects.

    expect(V.run).toHaveBeenCalledTimes(1);

    // VALIDATED published
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.VALIDATED, {
      formId: "myForm",
      isValid: true,
      errors: {},
      data: { email: "a@b.com", name: "Pascal" },
    });

    // Errors cleared and ERRORS_CHANGE published
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: {},
    });

    // SUBMIT_SUCCESS published
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.SUBMIT_SUCCESS, {
      formId: "myForm",
      data: { email: "a@b.com", name: "Pascal" },
    });

    // onSubmit called
    expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.com", name: "Pascal" });

    // internal errors cleared
    expect(h.getErrors()).toEqual({});
  });

  it("submit error: publishes VALIDATED and SUBMIT_ERROR, stores errors and publishes ERRORS_CHANGE, does not call onSubmit", () => {
    const validateErrors = { email: ["Invalid email"], name: ["Too short"] };
    vi.spyOn(V, "run").mockReturnValue({
      isValid: false,
      errors: validateErrors,
    });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", { schema: true }, onSubmit);

    const form = document.getElementById("myForm");
    form.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );

    // VALIDATED published
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.VALIDATED, {
      formId: "myForm",
      isValid: false,
      errors: validateErrors,
      data: { email: "a@b.com", name: "Pascal" },
    });

    // ERRORS_CHANGE published with errors
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: validateErrors,
    });

    // SUBMIT_ERROR published
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.SUBMIT_ERROR, {
      formId: "myForm",
      errors: validateErrors,
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(h.getErrors()).toEqual(validateErrors);
  });

  it("reset() restores initial values, clears errors, resets DOM, and publishes RESET", () => {
    vi.spyOn(V, "run").mockReturnValue({ isValid: true, errors: {} });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", {}, onSubmit);

    // change DOM + state
    const nameInput = document.querySelector('input[name="name"]');
    nameInput.value = "Changed";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));

    // set an error
    h.errors = { name: ["Bad"] };

    h.reset();

    // state restored
    expect(h.getFormState()).toEqual({ email: "a@b.com", name: "Pascal" });
    expect(h.getErrors()).toEqual({});

    // DOM reset should restore original input values
    expect(document.querySelector('input[name="name"]').value).toBe("Pascal");

    // publishes state + errors + RESET
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.STATE_CHANGE, {
      formId: "myForm",
      state: { email: "a@b.com", name: "Pascal" },
    });
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: {},
    });
    expect(pubSpy).toHaveBeenCalledWith(FormEvents.RESET, { formId: "myForm" });
  });

  it("validateNow() runs validation, updates errors, publishes ERRORS_CHANGE + VALIDATED, returns result", () => {
    const validateErrors = { email: ["Nope"] };
    vi.spyOn(V, "run").mockReturnValue({
      isValid: false,
      errors: validateErrors,
    });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", { schema: true }, onSubmit);

    const result = h.validateNow();

    expect(result).toEqual({ isValid: false, errors: validateErrors });
    expect(h.getErrors()).toEqual(validateErrors);

    expect(pubSpy).toHaveBeenCalledWith(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: validateErrors,
    });

    expect(pubSpy).toHaveBeenCalledWith(FormEvents.VALIDATED, {
      formId: "myForm",
      isValid: false,
      errors: validateErrors,
      data: { email: "a@b.com", name: "Pascal" },
    });
  });

  it("destroy() removes listeners so subsequent events do not update state", () => {
    vi.spyOn(V, "run").mockReturnValue({ isValid: true, errors: {} });

    const onSubmit = vi.fn();
    const h = new FormHandler("myForm", {}, onSubmit);

    pubSpy.mockClear();

    h.destroy();

    const emailInput = document.querySelector('input[name="email"]');
    emailInput.value = "after@destroy.com";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));

    // No state publish after destroy
    expect(pubSpy).not.toHaveBeenCalledWith(
      FormEvents.STATE_CHANGE,
      expect.anything(),
    );
  });

  it("FormErrorRenderer listens to ERRORS_CHANGE and renders errors after fields by default", () => {
    const r = new FormErrorRenderer("myForm");
    expect(subSpy).toHaveBeenCalledWith(
      FormEvents.ERRORS_CHANGE,
      expect.any(Function),
    );

    // Publish errors; renderer should inject error span after field
    EVT.pub(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: { email: ["Email invalid"] },
    });

    const emailField = document.querySelector('input[name="email"]');
    const inserted = emailField.nextElementSibling;

    expect(inserted).toBeTruthy();
    expect(inserted.className).toContain("form-error-container");
    expect(inserted.dataset.field).toBe("email");
    expect(inserted.textContent).toContain("Email invalid");

    r.destroy();
  });

  it("FormErrorRenderer supports custom containers via setContainer()", () => {
    const r = new FormErrorRenderer("myForm");
    r.setContainer("email", "#customEmailErrors");

    EVT.pub(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: { email: ["In custom container"] },
    });

    const custom = document.getElementById("customEmailErrors");
    expect(custom.textContent).toContain("In custom container");

    // Should not insert after field when custom container exists
    const emailField = document.querySelector('input[name="email"]');
    const maybeInserted = emailField.nextElementSibling;
    expect(maybeInserted?.className || "").not.toContain(
      "form-error-container",
    );

    r.destroy();
  });

  it("FormErrorRenderer clearAll removes rendered errors", () => {
    const r = new FormErrorRenderer("myForm");

    EVT.pub(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: { email: ["Will clear"] },
    });

    expect(document.querySelectorAll(".form-error-container").length).toBe(1);

    r.clearAll();
    expect(document.querySelectorAll(".form-error-container").length).toBe(0);

    r.destroy();
  });

  it("FormErrorRenderer destroy unsubscribes and clears DOM", () => {
    const r = new FormErrorRenderer("myForm");

    EVT.pub(FormEvents.ERRORS_CHANGE, {
      formId: "myForm",
      errors: { email: ["Will be removed on destroy"] },
    });

    expect(document.querySelectorAll(".form-error-container").length).toBe(1);

    r.destroy();

    expect(unsubSpy).toHaveBeenCalledWith(
      FormEvents.ERRORS_CHANGE,
      expect.any(Function),
    );
    expect(document.querySelectorAll(".form-error-container").length).toBe(0);
  });

  it("useFormHandler() wires handler+renderer and exposes reset/validate/destroy/setContainer", () => {
    vi.spyOn(V, "run").mockReturnValue({
      isValid: false,
      errors: { email: ["Bad"] },
    });

    const api = useFormHandler("myForm", { schema: true }, vi.fn());

    // validate should render errors through renderer because ERRORS_CHANGE is published
    api.validate();

    // error should be visible
    expect(document.body.textContent).toContain("Bad");

    // set custom container and validate again
    api.setContainer("email", "#customEmailErrors");
    api.validate();
    expect(document.getElementById("customEmailErrors").textContent).toContain(
      "Bad",
    );

    // reset clears errors
    api.reset();
    expect(document.querySelectorAll(".form-error-container").length).toBe(0);
    expect(document.getElementById("customEmailErrors").textContent).toBe("");

    // destroy should not throw
    expect(() => api.destroy()).not.toThrow();
  });
});
