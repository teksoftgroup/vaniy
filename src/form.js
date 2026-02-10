"use strict";

import EVT from "./evt.js";
import V from "./validator.js";

/**
 * Form lifecycle events publish through our EVET pub/sub
 * Consumers can subscribe using EVT.sub(event, callback)
 */
const FormEvents = {
  STATE_CHANGE: "form:state:change",
  ERRORS_CHANGE: "form:errors:change",
  SUBMIT_SUCCESS: "form:submit:success",
  SUBMIT_ERROR: "form:submit:error",
  RESET: "form:reset",
  VALIDATED: "form:validated",
};

/**
 * @typedef {Object} FormHandlerOptions
 * @property {(data:Object)=>Promise<Object>|Object} [preSubmit]
 *  Optional hook to mutate/transform data before final submit.
 *
 * @property {string} [containerClass]
 *  CSS class for error containers.
 *
 * @property {string} [errorClass]
 *  CSS class applied to error text.
 *
 * @property {boolean} [insertAfterField]
 *  If true, errors appear after input fields.
 */

/**
 * Handles:
 * - form state tracking
 * - validation
 * - submission
 * - event publishing
 */
class FormHandler {
  /**
   * @param {string} formId form element id string
   * @param {Object} schema Validation schema for validator.js
   * @param {(data:Object)=>void} onSubmit Callback when valid
   * @param {FormHandlerOptions} [options]
   */
  constructor(formId, schema, onSubmit, options = {}) {
    this.formId = formId;
    this.schema = schema;
    this.onSubmit = onSubmit;
    this.preSubmit = options.preSubmit || null;
    this.form = null;
    this.formState = {};
    this.errors = {};
    this.initialValues = {};

    this._boundHandleSubmit = this.#handleSubmit.bind(this);
    this._boundHandleInput = this.#handleInput.bind(this);

    this.#init();
  }

  // Initialize listeners and capture initial state.
  #init() {
    this.form = document.getElementById(this.formId);

    if (!this.form) {
      console.error(`Form with id ${this.formId} not found`);
      return;
    }

    this.#captureInitialValues();
    this.form.addEventListener("submit", this._boundHandleSubmit);
    this.form.addEventListener("input", this._boundHandleInput);

    this.#publishState();
  }

  // Setup initial values of the form.
  #captureInitialValues() {
    const formElements = this.form.elements;

    for (const element of Array.from(formElements)) {
      if (element.name) {
        this.initialValues[element.name] = element.value;
        this.formState[element.name] = element.value;
      }
    }
  }

  // Handle every input as they happen in here
  #handleInput(event) {
    const { name, value } = event.target;
    if (!name) return;

    this.formState[name] = value;
    this.#publishState();

    if (this.errors[name]) {
      delete this.errors[name];
      this.#publishErrors();
    }
  }

  // Handle the form submission.
  async #handleSubmit(event) {
    event.preventDefault();

    const data = new FormData(this.form);
    let formObject = {};

    data.forEach((value, key) => {
      formObject[key] = value;
    });

    this.formState = formObject;
    this.#publishState();

    const { isValid, errors: validateErrors } = V.run(this.schema, formObject);

    EVT.pub(FormEvents.VALIDATED, {
      formId: this.formId,
      isValid,
      errors: validateErrors,
      data: formObject,
    });

    if (!isValid) {
      this.errors = validateErrors;
      this.#publishErrors();

      EVT.pub(FormEvents.SUBMIT_ERROR, {
        formId: this.formId,
        errors: validateErrors,
      });
      return;
    }

    this.errors = {};
    this.#publishErrors();

    if (this.preSubmit) {
      try {
        formObject = await this.preSubmit(formObject);
      } catch (error) {
        EVT.pub(FormEvents.SUBMIT_ERROR, {
          formId: this.formId,
          errors: { _preSubmit: [error.message] },
        });
        return;
      }
    }

    EVT.pub(FormEvents.SUBMIT_SUCCESS, {
      formId: this.formId,
      data: formObject,
    });

    this.onSubmit(formObject);
  }

  #publishState() {
    EVT.pub(FormEvents.STATE_CHANGE, {
      formId: this.formId,
      state: { ...this.formState },
    });
  }

  #publishErrors() {
    EVT.pub(FormEvents.ERRORS_CHANGE, {
      formId: this.formId,
      errors: { ...this.errors },
    });
  }

  /** @returns {Object} Copy of form state */
  getFormState() {
    return { ...this.formState };
  }

  /** @returns {Object} Copy of current errors */
  getErrors() {
    return { ...this.errors };
  }

  // Reset form to initial values.
  reset() {
    this.formState = { ...this.initialValues };
    this.errors = {};

    if (this.form) {
      this.form.reset();
    }

    this.#publishState();
    this.#publishErrors();

    EVT.pub(FormEvents.RESET, { formId: this.formId });
  }

  // Manually trigger validation
  validateNow() {
    const data = new FormData(this.form);
    const formObject = {};

    data.forEach((value, key) => {
      formObject[key] = value;
    });

    const result = V.run(this.schema, formObject);
    this.errors = result.errors;
    this.#publishErrors();

    EVT.pub(FormEvents.VALIDATED, {
      formId: this.formId,
      isValid: result.isValid,
      errors: result.errors,
      data: formObject,
    });

    return result;
  }

  // Destroy listeners
  destroy() {
    if (this.form) {
      this.form.removeEventListener("submit", this._boundHandleSubmit);
      this.form.removeEventListener("input", this._boundHandleInput);
    }
  }
}

/**
 * Automatically renders validation errors in the DOM.
 */
class FormErrorRenderer {
  /**
   * @param {string} formId form element id string
   * @param {FormHandlerOptions} [options]
   */
  constructor(formId, options = {}) {
    this.formId = formId;
    this.options = {
      containerClass: "form-error-container",
      errorClass: "text-danger",
      insertAfterField: true,
      ...options,
    };

    this.customContainers = {};

    this._boundHandleErrors = this.#handleErrors.bind(this);
    EVT.sub(FormEvents.ERRORS_CHANGE, this._boundHandleErrors);
  }

  #handleErrors({ formId, errors }) {
    if (formId !== this.formId) return;

    this.clearAll();
    this.renderAll(errors);
  }

  /**
   * Set custom error container
   * @param {string} fieldName name of the field within the formo
   * @param {HTMLElement|string} container value to set the custom container with
   */
  setContainer(fieldName, container) {
    this.customContainers[fieldName] =
      typeof container === "string"
        ? document.querySelector(container)
        : container;
  }

  renderAll(errors) {
    for (const field in errors) {
      this.render(field, errors[field]);
    }
  }

  render(fieldName, errorList) {
    if (!errorList || errorList.length === 0) return null;

    const errorSpan = document.createElement("span");
    errorSpan.className = `${this.options.containerClass} ${this.options.errorClass}`;
    errorSpan.dataset.field = fieldName;

    const ul = document.createElement("ul");
    errorList.forEach((item) => {
      const li = document.createElement("li");
      const i = document.createElement("i");
      i.textContent = item;
      li.appendChild(i);
      ul.appendChild(li);
    });
    errorSpan.appendChild(ul);

    const targetContainer = this.customContainers[fieldName];

    if (targetContainer) {
      targetContainer.innerHTML = "";
      targetContainer.appendChild(errorSpan);
    } else if (this.options.insertAfterField) {
      const form = document.getElementById(this.formId);
      const field = form?.querySelector(`[name="${fieldName}"]`);
      if (field) {
        field.insertAdjacentElement("afterend", errorSpan);
      }
    }
    return errorSpan;
  }

  clearAll() {
    const form = document.getElementById(this.formId);
    if (!form) return;

    const errors = form.querySelectorAll(`.${this.options.containerClass}`);
    errors.forEach((el) => el.remove());

    for (const key in this.customContainers) {
      if (this.customContainers[key]) {
        this.customContainers[key].innerHTML = "";
      }
    }
  }

  destroy() {
    EVT.unsub(FormEvents.ERRORS_CHANGE, this._boundHandleErrors);
    this.clearAll();
  }
}

export { FormEvents, FormHandler, FormErrorRenderer };

/**
 * High-level helper to attach validation + error rendering.
 *
 * @param {string} formId form element id string
 * @param {Object} schema schema rule for
 * @param {(data:Object)=>void} onSubmit function to execute when submit button is clicked
 * @param {FormHandlerOptions} [options] extra options including a presubmit
 * if you have any external api call to make before submitting that's where it would happen
 *
 * @example
 * const form = useFormHandler("loginForm", schema, data => {
 *   console.log("submit", data);
 * }, {
 *   preSubmit: async (d) => ({ ...d, token: "123" })
 * });
 */
export function useFormHandler(formId, schema, onSubmit, options) {
  const h = new FormHandler(formId, schema, onSubmit, options);
  const r = new FormErrorRenderer(formId, options);
  return {
    reset: () => h.reset(),
    validate: () => h.validateNow(),
    destroy: () => {
      r.destroy();
      h.destroy();
    },
    setContainer: (fieldName, container) =>
      r.setContainer(fieldName, container),
  };
}
