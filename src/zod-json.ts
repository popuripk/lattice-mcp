import type { z } from "zod";

/** Minimal Zod → JSON Schema for LLM tool contracts. Not a full converter. */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return walk(schema);
}

function walk(schema: z.ZodTypeAny): Record<string, unknown> {
  const typeName = (schema._def as { typeName?: string }).typeName ?? "";
  switch (typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodOptional":
      return walk((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
    case "ZodDefault":
      return walk((schema as z.ZodDefault<z.ZodTypeAny>).removeDefault());
    case "ZodArray":
      return { type: "array", items: walk((schema as z.ZodArray<z.ZodTypeAny>).element) };
    case "ZodEnum": {
      const values = (schema._def as { values: string[] }).values;
      return { type: "string", enum: values };
    }
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = walk(value as z.ZodTypeAny);
        const inner = (value as z.ZodTypeAny)._def as { typeName?: string };
        if (inner.typeName !== "ZodOptional" && inner.typeName !== "ZodDefault") {
          required.push(key);
        }
      }
      return { type: "object", properties, required, additionalProperties: false };
    }
    default:
      return { type: "object" };
  }
}
