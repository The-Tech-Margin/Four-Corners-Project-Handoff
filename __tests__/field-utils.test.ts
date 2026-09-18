import { describe, it, expect } from "vitest";
import {
  getValueByPath,
  setValueByPath,
  deleteValueByPath,
  hasValue,
  hasFieldValue,
  isString,
  isNumber,
  isBoolean,
  isArray,
  isObject,
  transformValue,
  stripEmptyValues,
} from "@/lib/field-utils";

describe("getValueByPath", () => {
  const obj = { a: { b: { c: 42 } }, d: [1, 2, 3] };

  it("gets nested value", () => {
    expect(getValueByPath(obj, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing path", () => {
    expect(getValueByPath(obj, "a.b.x")).toBeUndefined();
  });

  it("returns undefined for null obj", () => {
    expect(getValueByPath(null as unknown as Record<string, unknown>, "a.b")).toBeUndefined();
  });

  it("gets top-level value", () => {
    expect(getValueByPath(obj, "d")).toEqual([1, 2, 3]);
  });
});

describe("setValueByPath", () => {
  it("sets nested value, creating intermediates", () => {
    const obj: Record<string, unknown> = {};
    setValueByPath(obj, "a.b.c", 99);
    expect((obj as { a: { b: { c: number } } }).a.b.c).toBe(99);
  });

  it("overwrites existing value", () => {
    const obj = { a: { b: 1 } };
    setValueByPath(obj, "a.b", 2);
    expect(obj.a.b).toBe(2);
  });

  it("does nothing for null obj", () => {
    expect(() => setValueByPath(null as unknown as Record<string, unknown>, "a.b", 1)).not.toThrow();
  });
});

describe("deleteValueByPath", () => {
  it("deletes nested value", () => {
    const obj = { a: { b: 1, c: 2 } };
    deleteValueByPath(obj, "a.b");
    expect(obj.a).toEqual({ c: 2 });
  });

  it("does nothing for missing path", () => {
    const obj = { a: 1 };
    expect(() => deleteValueByPath(obj, "x.y.z")).not.toThrow();
  });
});

describe("hasValue", () => {
  it("returns false for null/undefined", () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasValue("")).toBe(false);
    expect(hasValue("  ")).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasValue([])).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(hasValue({})).toBe(false);
  });

  it("returns true for non-empty values", () => {
    expect(hasValue("hello")).toBe(true);
    expect(hasValue(0)).toBe(true);
    expect(hasValue(false)).toBe(true);
    expect(hasValue([1])).toBe(true);
    expect(hasValue({ a: 1 })).toBe(true);
  });
});

describe("hasFieldValue", () => {
  it("checks nested field existence", () => {
    const obj = { a: { b: "yes" }, c: { d: "" } };
    expect(hasFieldValue(obj, "a.b")).toBe(true);
    expect(hasFieldValue(obj, "c.d")).toBe(false); // empty string
    expect(hasFieldValue(obj, "x.y")).toBe(false); // missing
  });
});

describe("type guards", () => {
  it("isString", () => {
    expect(isString("hello")).toBe(true);
    expect(isString(123)).toBe(false);
  });

  it("isNumber", () => {
    expect(isNumber(42)).toBe(true);
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber("42")).toBe(false);
  });

  it("isBoolean", () => {
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(0)).toBe(false);
  });

  it("isArray", () => {
    expect(isArray([1, 2])).toBe(true);
    expect(isArray("not array")).toBe(false);
  });

  it("isObject", () => {
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject(null)).toBe(false);
    expect(isObject([1])).toBe(false);
  });
});

describe("transformValue", () => {
  it("applies transformer function", () => {
    expect(transformValue("hello", (v) => v.toUpperCase())).toBe("HELLO");
  });

  it("returns value unchanged without transformer", () => {
    expect(transformValue("hello")).toBe("hello");
  });

  it("returns null/undefined unchanged", () => {
    expect(transformValue(null)).toBeNull();
    expect(transformValue(undefined)).toBeUndefined();
  });
});

describe("stripEmptyValues", () => {
  it("removes null/undefined/empty string values", () => {
    const input = { a: "keep", b: "", c: null, d: undefined };
    const result = stripEmptyValues(input);
    expect(result).toEqual({ a: "keep" });
  });

  it("removes empty nested objects", () => {
    const input = { a: { b: "", c: "" }, d: "keep" };
    const result = stripEmptyValues(input);
    expect(result).toEqual({ d: "keep" });
  });

  it("removes empty arrays", () => {
    const input = { a: [], b: [1, 2] };
    const result = stripEmptyValues(input);
    expect(result).toEqual({ b: [1, 2] });
  });

  it("preserves zero and false", () => {
    const input = { a: 0, b: false, c: "text" };
    const result = stripEmptyValues(input);
    expect(result).toEqual({ a: 0, b: false, c: "text" });
  });

  it("recursively strips nested empty objects", () => {
    const input = { a: { b: { c: "" } }, d: { e: "keep" } };
    const result = stripEmptyValues(input);
    expect(result).toEqual({ d: { e: "keep" } });
  });
});
