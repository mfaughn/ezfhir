import { describe, it, expect, beforeAll } from "vitest";
import {
  createPackageLoader,
  loadPackage,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";
import { buildSearchIndex, searchSpec } from "../../src/pipeline/searchIndex.js";

describe("Search Index", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
    buildSearchIndex(loader, scope);
  }, 120000);

  it("finds Patient by exact name", () => {
    const results = searchSpec("Patient");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Patient");
  });

  it("finds Observation by exact name", () => {
    const results = searchSpec("Observation");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Observation");
  });

  it("returns relevant results for 'blood pressure'", () => {
    const results = searchSpec("blood pressure");
    expect(results.length).toBeGreaterThan(0);
    // Should return Observation-related results
    const names = results.map((r) => r.name);
    expect(
      names.some((n) => n.includes("Observation") || n.includes("observation"))
    ).toBe(true);
  });

  it("returns relevant results for 'medication'", () => {
    const results = searchSpec("medication");
    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.name);
    expect(
      names.some((n) => n.includes("Medication"))
    ).toBe(true);
  });

  it("returns empty array for nonsense queries", () => {
    const results = searchSpec("xyzzyplugh");
    expect(results).toEqual([]);
  });

  it("limits results to 10 by default", () => {
    const results = searchSpec("patient");
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it("respects custom limit", () => {
    const results = searchSpec("patient", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("includes result type and description", () => {
    const results = searchSpec("Patient");
    const patient = results.find((r) => r.name === "Patient");
    expect(patient).toBeDefined();
    expect(patient!.type).toBe("resource");
    expect(patient!.description).toBeTruthy();
  });

  it("finds datatypes", () => {
    const results = searchSpec("HumanName");
    expect(results.length).toBeGreaterThan(0);
    const humanName = results.find((r) => r.name === "HumanName");
    expect(humanName).toBeDefined();
    expect(humanName!.type).toBe("complex-type");
  });
});
