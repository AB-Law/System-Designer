import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import schema from "../../../schemas/problem.schema.json";

const problems = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;

describe("problem JSON schema", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  it("has bundled problems to check", () => {
    expect(Object.keys(problems).length).toBeGreaterThan(0);
  });

  for (const [path, data] of Object.entries(problems)) {
    const id = path.replace(/^\.\//, "").replace(/\.json$/, "");
    it(`${id} matches schemas/problem.schema.json`, () => {
      const ok = validate(data);
      expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
      expect((data as { id?: string }).id).toBe(id);
    });
  }
});
