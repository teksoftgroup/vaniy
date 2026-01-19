"use strict";

const methods = {
  required: {
    method: (value) => String(value ?? "").trim() !== "",
    message: "This field is required",
  },
  requiredIf: {
    method: (expression) => (value, formData) => {
      const [field, expected] = String(expression).split("=");
      const otherValue = formData?.[field];

      const condition =
        expected != null
          ? String(otherValue ?? "") === expected
          : String(otherValue ?? "").trim() !== "";

      // if condition is true, this field must be non-empty
      if (condition) {
        return String(value ?? "").trim() !== "";
      }

      // otherwise it's optional
      return true;
    },
    message: (expression) => {
      const [field, expected] = String(expression).split("=");

      return expected != null
        ? `This field is requied when ${field} is ${expected}`
        : `This field is required when ${field} has a value`;
    },
  },
  email: {
    method: (value) => /\S+@\S+\.\S+/.test(value),
    message: "Email is invalid",
  },
  min: {
    method: (length) => (value) => String(value ?? "").length >= Number(length),
    message: (length) => `Must be at least ${length} characters`,
  },
  max: {
    method: (length) => (value) => String(value ?? "").length <= Number(length),
    message: (length) => `Must be at most ${length} characters`,
  },
  date: {
    method: (value) => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) return false;
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return (
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
      );
    },
    message: "Date is invalid. Use the format YYYY-MM-DD.",
  },
  currency: {
    method: (value) => /^\$?\d{1,3}((,\d{3})*|\d*)(\.\d{2})?$/.test(value),
    message: "Currency is invalid. Use the format $123,456.78 or 123456.78.",
  },
  same: {
    method: (otherField) => (value, formData) =>
      String(value ?? "") === String(formData?.[otherField] ?? ""),
    message: (otherField) => `Must match ${otherField}`,
  },
  in: {
    method: (list) => (value) => {
      const allowed = Array.isArray(list)
        ? list
        : String(list ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      return allowed.includes(String(value ?? "").trim());
    },
    message: (list) => {
      const allowed = Array.isArray(list)
        ? list
        : String(list ?? "")
            .split(",")
            .map((s) => s.trim());
      return `Must be one of the following: ${allowed.filter(Boolean).join(",")}`;
    },
  },
};

function parseRule(rule) {
  const index = rule.indexOf(":");
  if (index === -1) return { name: rule, param: undefined };
  return { name: rule.slice(0, index), param: rule.slice(index + 1) };
}

function run(schema, formData) {
  let isValid = true;
  const errors = {};

  for (const field in schema) {
    const rules = schema[field] || [];

    for (const ruleString of rules) {
      const { name, param } = parseRule(ruleString);
      const validationMethod = methods[name];

      if (!validationMethod) {
        //unknown rule - skip
        continue;
      }

      const value = formData?.[field];

      const isFieldValid =
        param !== undefined
          ? validationMethod.method(param)(value, formData)
          : validationMethod.method(value, formData);

      if (!isFieldValid) {
        isValid = false;
        if (!errors[field]) {
          errors[field] = [];
        }

        const errorMessage =
          typeof validationMethod.message === "function"
            ? validationMethod.message(param)
            : validationMethod.message;

        errors[field].push(errorMessage);
      }
    }
  }
  return { isValid, errors };
}

const V = {
  run,
  ping: () => console.log("PONG"),
  description: "V is for validating forms",
};

export default V;
