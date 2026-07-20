import { describe, expect, it } from "vitest";
import { toGeminiParameters, toGeminiSchema } from "./gemini-schema";
import { healthChangeSetJsonSchema } from "../agent/change-schema";

describe("toGeminiSchema", () => {
  it("drops JSON Schema keywords Gemini rejects", () => {
    const lowered = toGeminiSchema({
      type: "object",
      properties: { query: { type: "string", minLength: 1 } },
      required: ["query"],
      additionalProperties: false,
    });
    expect(lowered).toEqual({
      type: "object",
      properties: { query: { type: "string", minLength: 1 } },
      required: ["query"],
    });
  });

  it("collapses zod nullable anyOf into nullable and const into enum", () => {
    const lowered = toGeminiSchema({
      type: "object",
      properties: {
        kind: { type: "string", const: "log_weight" },
        amount: {
          anyOf: [{ type: "number", exclusiveMinimum: 0 }, { type: "null" }],
        },
      },
      required: ["kind"],
      additionalProperties: false,
    });
    expect(lowered.properties).toEqual({
      kind: { type: "string", enum: ["log_weight"] },
      amount: { type: "number", minimum: 0, nullable: true },
    });
  });

  it("keeps multi-branch anyOf as anyOf", () => {
    const lowered = toGeminiSchema({
      anyOf: [
        { type: "string", const: "a" },
        { type: "integer", exclusiveMinimum: 0 },
      ],
    });
    expect(lowered).toEqual({
      anyOf: [
        { type: "string", enum: ["a"] },
        { type: "integer", minimum: 0 },
      ],
    });
  });

  it("lowers the health change-set schema without unsupported keywords", () => {
    const lowered = toGeminiSchema(healthChangeSetJsonSchema());
    const json = JSON.stringify(lowered);
    for (const forbidden of [
      '"additionalProperties"',
      '"const"',
      '"exclusiveMinimum"',
      '"exclusiveMaximum"',
      '"$schema"',
      '"type":"null"',
      '"default"',
      '"oneOf"',
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(lowered.type).toBe("object");
    const items = (lowered.properties as any).items.items;
    expect(items.anyOf.length).toBeGreaterThanOrEqual(15);
    expect(items.anyOf[0].properties.kind.enum).toEqual(["create_medication_course"]);
  });
});

describe("toGeminiParameters", () => {
  it("omits parameters for a no-argument tool", () => {
    expect(
      toGeminiParameters({
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      }),
    ).toBeUndefined();
  });

  it("keeps parameters for tools with arguments", () => {
    expect(
      toGeminiParameters({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      }),
    ).toBeTruthy();
  });
});
