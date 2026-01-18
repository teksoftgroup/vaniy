"use strict";

const methods = {
  required: {
    method: (value) => value.trim() !== "",
    message: "This field is required",
  },
  email: {
    method: (value) => /\S+@\S+\.\S+/.test(value),
    message: "Email is invalid",
  },
  min: {
    method: (length) => (value) => value.length >= length,
    message: (length) => `Must be at least ${length} characters`,
  },
  max: {
    method: (length) => (value) => value.length <= length,
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
};

function parseRule(rule) {
  const [name, param] = rule.split(":");
  return { name, param: param ? parseInt(param, 10) : undefined };
}

function run(schema, formData) {
  let isValid = true;
  const errors = {};

  for (const field in schema) {
    const rules = schema[field];

    for (const ruleString of rules) {
      const { name, param } = parseRule(ruleString);
      const validationMethod = methods[name];

      const isFieldValid =
        param !== undefined
          ? validationMethod.method(param)(formData[field])
          : validationMethod.method(formData[field]);

      if (!isFieldValid) {
        isValid = false;
        if (!errors[field]) {
          errors[field] = [];
        }
        const errorMessage =
          param !== undefined
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
  version: "1.0.0",
  description: "V is for validating forms",
};

export default V;
