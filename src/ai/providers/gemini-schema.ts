/**
 * Gemini function declarations take an OpenAPI-flavored Schema proto, not full
 * JSON Schema: unknown fields (`additionalProperties`, `const`, `$schema`,
 * `exclusiveMinimum`, ...) are rejected with HTTP 400 "Unknown name". This
 * module lowers the JSON Schema our tools declare (including the zod-generated
 * draft-2020-12 change-set schema) onto the subset Gemini accepts.
 */

const PASSTHROUGH_KEYS = [
  "description",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
] as const;

/**
 * Tool `parameters` for a Gemini function declaration, or undefined for a
 * no-argument tool — Gemini rejects an OBJECT schema with empty `properties`,
 * so those tools must omit `parameters` entirely.
 */
export function toGeminiParameters(schema: unknown): Record<string, unknown> | undefined {
  const lowered = toGeminiSchema(schema);
  if (lowered.type === "object" && !Object.keys((lowered.properties as object) ?? {}).length) {
    return undefined;
  }
  return lowered;
}

export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return { type: "string" };
  const node = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  let type = node.type;
  let nullable = node.nullable === true;
  // draft-2020-12 spells nullability as a type array ("type": ["string","null"]).
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    if (nonNull.length !== type.length) nullable = true;
    type = nonNull[0];
  }

  // zod emits `.nullable()` as anyOf [schema, {type:"null"}] and discriminated
  // unions as oneOf; Gemini only knows anyOf. Collapse the null branch into
  // `nullable` and inline a now-single remaining branch.
  const union = Array.isArray(node.anyOf) ? node.anyOf : node.oneOf;
  if (Array.isArray(union)) {
    const branches = union.filter((branch) => !isNullSchema(branch));
    if (branches.length !== union.length) nullable = true;
    if (branches.length === 1) {
      Object.assign(out, toGeminiSchema(branches[0]));
    } else if (branches.length > 1) {
      out.anyOf = branches.map((branch) => toGeminiSchema(branch));
    }
  }

  if (typeof type === "string" && !out.anyOf && !out.type) out.type = type;

  if (Array.isArray(node.enum)) out.enum = node.enum;
  else if (node.const !== undefined) out.enum = [node.const];

  for (const key of PASSTHROUGH_KEYS) {
    if (node[key] !== undefined) out[key] = node[key];
  }
  if (typeof node.exclusiveMinimum === "number" && out.minimum === undefined) {
    out.minimum = node.exclusiveMinimum;
  }
  if (typeof node.exclusiveMaximum === "number" && out.maximum === undefined) {
    out.maximum = node.exclusiveMaximum;
  }

  if (node.properties && typeof node.properties === "object") {
    const properties: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(node.properties as Record<string, unknown>)) {
      properties[name] = toGeminiSchema(value);
    }
    out.properties = properties;
    if (Array.isArray(node.required)) {
      const required = node.required.filter(
        (name) => typeof name === "string" && name in properties,
      );
      if (required.length) out.required = required;
    }
  }
  if (node.items !== undefined) out.items = toGeminiSchema(node.items);

  if (nullable) out.nullable = true;
  if (!out.type && !out.anyOf) out.type = out.properties ? "object" : "string";
  return out;
}

function isNullSchema(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).type === "null" &&
    Object.keys(value).filter((key) => key !== "type").length === 0
  );
}
