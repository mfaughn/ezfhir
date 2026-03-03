import { describe, it, expect, beforeAll } from "vitest";
import { extractSearchParams } from "../../src/pipeline/searchParamExtractor.js";
import {
  createPackageLoader,
  loadPackage,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("Search Parameter Extractor", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
  }, 120000);

  it("extracts Patient search params", () => {
    const params = extractSearchParams(loader, "Patient", scope);
    expect(params.length).toBeGreaterThan(5);
    const names = params.map((p) => p.name);
    expect(names).toContain("general-practitioner");
    expect(names).toContain("death-date");
  });

  it("extracts correct type for search params", () => {
    const params = extractSearchParams(loader, "Patient", scope);
    const gp = params.find((p) => p.name === "general-practitioner");
    expect(gp).toBeDefined();
    expect(gp!.type).toBe("reference");
  });

  it("extracts Observation search params", () => {
    const params = extractSearchParams(loader, "Observation", scope);
    expect(params.length).toBeGreaterThan(5);
    const names = params.map((p) => p.name);
    // Observation has composite search params like code-value-date
    expect(names).toContain("code-value-date");
    expect(names).toContain("combo-code");
  });

  it("extracts MedicationRequest search params", () => {
    const params = extractSearchParams(loader, "MedicationRequest", scope);
    expect(params.length).toBeGreaterThan(3);
  });

  it("returns empty for nonexistent resource", () => {
    const params = extractSearchParams(loader, "FakeResource", scope);
    expect(params).toHaveLength(0);
  });

  it("results are sorted by name", () => {
    const params = extractSearchParams(loader, "Patient", scope);
    const names = params.map((p) => p.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it("all params have required fields", () => {
    const params = extractSearchParams(loader, "Patient", scope);
    for (const p of params) {
      expect(p.name).toBeTruthy();
      expect(p.type).toBeTruthy();
      expect(p.expression).toBeDefined();
    }
  });
});
