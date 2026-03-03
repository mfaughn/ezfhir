import { describe, it, expect, beforeAll } from "vitest";
import {
  extractValueSetSummary,
  extractAllValueSetSummaries,
} from "../../src/pipeline/valueSetExtractor.js";
import {
  createPackageLoader,
  loadPackage,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("ValueSet Summary Extractor", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
  }, 120000);

  describe("small value sets (inline codes)", () => {
    it("extracts administrative-gender with inline codes", () => {
      const vs = extractValueSetSummary(loader, "administrative-gender", scope);
      expect(vs).toBeDefined();
      expect(vs!.name).toBe("AdministrativeGender");
      expect(vs!.url).toContain("administrative-gender");
      expect(vs!.codeCount).toBe(4);
      expect(vs!.codes).toBeDefined();
      expect(vs!.codes).toContain("male");
      expect(vs!.codes).toContain("female");
      expect(vs!.codes).toContain("other");
      expect(vs!.codes).toContain("unknown");
    });

    it("extracts observation-status with inline codes", () => {
      const vs = extractValueSetSummary(loader, "observation-status", scope);
      expect(vs).toBeDefined();
      expect(vs!.codeCount).toBeGreaterThan(0);
      expect(vs!.codes).toBeDefined();
      expect(vs!.codes).toContain("final");
      expect(vs!.codes).toContain("preliminary");
    });
  });

  describe("large value sets (count only)", () => {
    it("resource-types has many codes without inlining", () => {
      const vs = extractValueSetSummary(loader, "resource-types", scope);
      expect(vs).toBeDefined();
      expect(vs!.codeCount).toBeGreaterThan(20);
      // Codes should NOT be inlined for large value sets
      expect(vs!.codes).toBeUndefined();
    });
  });

  describe("value set metadata", () => {
    it("includes URL and status", () => {
      const vs = extractValueSetSummary(loader, "administrative-gender", scope);
      expect(vs!.url).toBe("http://hl7.org/fhir/ValueSet/administrative-gender");
      expect(vs!.status).toBe("active");
    });

    it("includes system references", () => {
      const vs = extractValueSetSummary(loader, "administrative-gender", scope);
      expect(vs!.systems.length).toBeGreaterThan(0);
    });

    it("truncates long descriptions", () => {
      // Find a VS with a long description
      const allVS = extractAllValueSetSummaries(loader, scope);
      const longDesc = allVS.find(
        (v) => v.description && v.description.length >= 100
      );
      if (longDesc) {
        expect(longDesc.description!.length).toBeLessThanOrEqual(120);
      }
    });
  });

  describe("edge cases", () => {
    it("returns undefined for nonexistent value set", () => {
      const vs = extractValueSetSummary(loader, "fake-valueset", scope);
      expect(vs).toBeUndefined();
    });
  });

  describe("bulk extraction", () => {
    it("extracts all R5 value sets", () => {
      const all = extractAllValueSetSummaries(loader, scope);
      expect(all.length).toBeGreaterThan(100);
    });

    it("results are sorted by name (case-insensitive)", () => {
      const all = extractAllValueSetSummaries(loader, scope);
      const names = all.map((v) => v.name);
      const sorted = [...names].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
      expect(names).toEqual(sorted);
    });
  });
});
