import { describe, it, expect, beforeAll } from "vitest";
import { extractOperations } from "../../src/pipeline/operationExtractor.js";
import {
  createPackageLoader,
  loadPackage,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("Operation Definition Extractor", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
  }, 120000);

  it("extracts Patient operations", () => {
    const ops = extractOperations(loader, "Patient", scope);
    expect(ops.length).toBeGreaterThanOrEqual(2);
    const names = ops.map((o) => o.name);
    expect(names).toContain("match");
  });

  it("operations have descriptions", () => {
    const ops = extractOperations(loader, "Patient", scope);
    for (const op of ops) {
      expect(op.name).toBeTruthy();
      expect(op.description).toBeTruthy();
    }
  });

  it("extracts operations for resource with $validate", () => {
    // $validate applies to many resources
    const ops = extractOperations(loader, "Resource", scope);
    const names = ops.map((o) => o.name);
    expect(names).toContain("validate");
  });

  it("returns empty for resource with no operations", () => {
    // Basic should have no specific operations
    const ops = extractOperations(loader, "Basic", scope);
    expect(ops).toHaveLength(0);
  });

  it("results are sorted by name", () => {
    const ops = extractOperations(loader, "Patient", scope);
    const names = ops.map((o) => o.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("descriptions are truncated to 80 chars max", () => {
    // Check all operations across a few resources
    for (const resource of ["Patient", "ValueSet", "CodeSystem"]) {
      const ops = extractOperations(loader, resource, scope);
      for (const op of ops) {
        expect(
          op.description.length,
          `${resource}.$${op.name} description too long`
        ).toBeLessThanOrEqual(80);
      }
    }
  });
});
