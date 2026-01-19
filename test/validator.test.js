import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import V from "../src/validator.js";

describe("validator.js (V)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes expected shape", () => {
    expect(V).toHaveProperty("run");
    expect(V).toHaveProperty("ping");
    expect(V).toHaveProperty("description");
    expect(typeof V.run).toBe("function");
    expect(typeof V.ping).toBe("function");
    expect(typeof V.description).toBe("string");
  });

  it("required: fails on empty or whitespace, passes otherwise", () => {
    const schema = { name: ["required"] };

    expect(V.run(schema, { name: "" })).toEqual({
      isValid: false,
      errors: { name: ["This field is required"] },
    });

    expect(V.run(schema, { name: "   " })).toEqual({
      isValid: false,
      errors: { name: ["This field is required"] },
    });

    expect(V.run(schema, { name: "Pascal" })).toEqual({
      isValid: true,
      errors: {},
    });
  });

  it("requiredIf: fails on dependent field not empty.", () => {
    const schema = { company: ["required"], tax_id: ["requiredIf:company"] };

    const res = V.run(schema, {
      company: "ACME",
      tax_id: "",
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toEqual({
      tax_id: ["This field is required when company has a value"],
    });
  });

  it("requiredIf: valid when dependent field is empty or whitespace, passes otherwise", () => {
    const schema = { tax_id: ["requiredIf:company"] };

    const res = V.run(schema, {
      company: "",
      tax_id: "",
    });

    expect(res.isValid).toBe(true);
  });

  it("email: validates basic email format", () => {
    const schema = { email: ["email"] };

    expect(V.run(schema, { email: "nope" })).toEqual({
      isValid: false,
      errors: { email: ["Email is invalid"] },
    });

    expect(V.run(schema, { email: "a@b.com" })).toEqual({
      isValid: true,
      errors: {},
    });
  });

  it("min: enforces minimum length and message is correct", () => {
    const schema = { password: ["min:6"] };

    expect(V.run(schema, { password: "123" })).toEqual({
      isValid: false,
      errors: { password: ["Must be at least 6 characters"] },
    });

    expect(V.run(schema, { password: "123456" })).toEqual({
      isValid: true,
      errors: {},
    });
  });

  it("max: enforces maximum length and message is correct", () => {
    const schema = { username: ["max:5"] };

    expect(V.run(schema, { username: "abcdef" })).toEqual({
      isValid: false,
      errors: { username: ["Must be at most 5 characters"] },
    });

    expect(V.run(schema, { username: "abcde" })).toEqual({
      isValid: true,
      errors: {},
    });
  });

  it("date: validates YYYY-MM-DD and rejects impossible dates", () => {
    const schema = { dob: ["date"] };

    // wrong format
    expect(V.run(schema, { dob: "01/01/2020" })).toEqual({
      isValid: false,
      errors: { dob: ["Date is invalid. Use the format YYYY-MM-DD."] },
    });

    // impossible date
    expect(V.run(schema, { dob: "2020-02-30" })).toEqual({
      isValid: false,
      errors: { dob: ["Date is invalid. Use the format YYYY-MM-DD."] },
    });

    // valid date
    expect(V.run(schema, { dob: "2020-02-29" })).toEqual({
      isValid: true,
      errors: {},
    });
  });

  it("currency: validates common currency formats", () => {
    const schema = { amount: ["currency"] };

    // valid
    expect(V.run(schema, { amount: "$123,456.78" })).toEqual({
      isValid: true,
      errors: {},
    });

    expect(V.run(schema, { amount: "123456.78" })).toEqual({
      isValid: true,
      errors: {},
    });

    expect(V.run(schema, { amount: "12.34" })).toEqual({
      isValid: true,
      errors: {},
    });

    // invalid (too many decimals)
    expect(V.run(schema, { amount: "12.345" })).toEqual({
      isValid: false,
      errors: {
        amount: [
          "Currency is invalid. Use the format $123,456.78 or 123456.78.",
        ],
      },
    });

    // invalid (letters)
    expect(V.run(schema, { amount: "abc" })).toEqual({
      isValid: false,
      errors: {
        amount: [
          "Currency is invalid. Use the format $123,456.78 or 123456.78.",
        ],
      },
    });
  });

  it("same: validates fields match", () => {
    const schema = {
      name: ["required", "max:10"],
      email: ["required", "email"],
      password: ["required"],
      confirm_password: ["required", "same:password"],
    };

    const res = V.run(schema, {
      name: "Pascal",
      email: "email@test.com",
      password: "1234567",
      confirm_password: "1234567",
    });

    expect(res.isValid).toBe(true);
  });

  it("same: validates fields don't match", () => {
    const schema = {
      email: ["required", "email"],
      password: ["required"],
      confirm_password: ["required", "same:password"],
    };

    const res = V.run(schema, {
      email: "email@test.com",
      password: "nope",
      confirm_password: "nah",
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toEqual({
      confirm_password: ["Must match password"],
    });
  });

  it("in: validates that fields is matching set of values", () => {
    const schema = {
      category: ["required", "in:action,thriller,horror"],
    };

    const res = V.run(schema, {
      category: "action",
    });

    expect(res.isValid).toBe(true);
  });

  it("in: validates that error is shown for no matching enum", () => {
    const schema = {
      category: ["in:action,thriller,horror"],
    };

    const res = V.run(schema, {
      category: "comedy",
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toEqual({
      category: ["Must be one of the following: action,thriller,horror"],
    });
  });

  it("accumulates multiple errors per field (required + email)", () => {
    const schema = { email: ["required", "email"] };

    const res = V.run(schema, { email: "   " });

    expect(res.isValid).toBe(false);
    expect(res.errors.email).toEqual([
      "This field is required",
      "Email is invalid",
    ]);
  });

  it("validates multiple fields and returns only failing fields in errors", () => {
    const schema = {
      name: ["required", "max:10"],
      email: ["required", "email"],
      password: ["min:6"],
    };

    const res = V.run(schema, {
      name: "Pascal",
      email: "bad-email",
      password: "123",
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toEqual({
      email: ["Email is invalid"],
      password: ["Must be at least 6 characters"],
    });
  });

  it("ping() logs PONG", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    V.ping();
    expect(spy).toHaveBeenCalledWith("PONG");
  });
});
