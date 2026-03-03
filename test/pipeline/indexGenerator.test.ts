import { describe, it, expect, beforeAll } from "vitest";
import {
  generateResourceIndex,
  generateDatatypeIndex,
} from "../../src/pipeline/indexGenerator.js";
import {
  createPackageLoader,
  loadPackage,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

describe("Index Generator", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
  }, 120000);

  describe("resource index", () => {
    it("generates a categorized resource index", () => {
      const index = generateResourceIndex(loader, scope, "5.0.0");
      expect(index).toContain("# FHIR Resource Index");
      expect(index).toContain(`@package ${scope}`);
      expect(index).toContain("@version 5.0.0");
    });

    it("includes standard categories", () => {
      const index = generateResourceIndex(loader, scope);
      expect(index).toContain("## Administration");
      expect(index).toContain("## Clinical");
      expect(index).toContain("## Workflow");
      expect(index).toContain("## Financial");
    });

    it("lists key resources under correct categories", () => {
      const index = generateResourceIndex(loader, scope);
      // Patient should be in Administration
      const adminSection = index.split("## Administration")[1]?.split("##")[0];
      expect(adminSection).toContain("Patient");

      // Encounter should be in Workflow
      const workflowSection = index.split("## Workflow")[1]?.split("##")[0];
      expect(workflowSection).toContain("Encounter");
    });

    it("includes descriptions", () => {
      const index = generateResourceIndex(loader, scope);
      // Patient should have a description
      const patientLine = index.split("\n").find((l) => l.startsWith("Patient"));
      expect(patientLine).toBeDefined();
      expect(patientLine!.length).toBeGreaterThan("Patient : ".length);
    });

    it("does not include abstract resources", () => {
      const index = generateResourceIndex(loader, scope);
      // DomainResource is abstract
      expect(index).not.toContain("DomainResource :");
    });

    it("handles uncategorized resources in Other section", () => {
      const index = generateResourceIndex(loader, scope);
      // There should be resources not in our predefined categories
      expect(index).toContain("## Other");
    });
  });

  describe("datatype index", () => {
    it("generates a datatype index", () => {
      const index = generateDatatypeIndex(loader, scope);
      expect(index).toContain("# FHIR Datatype Index");
      expect(index).toContain(`@package ${scope}`);
    });

    it("separates complex and primitive types", () => {
      const index = generateDatatypeIndex(loader, scope);
      expect(index).toContain("## Complex Types");
      expect(index).toContain("## Primitive Types");
    });

    it("includes key complex types", () => {
      const index = generateDatatypeIndex(loader, scope);
      const complexSection = index.split("## Complex Types")[1]?.split("##")[0];
      expect(complexSection).toContain("Identifier");
      expect(complexSection).toContain("CodeableConcept");
      expect(complexSection).toContain("HumanName");
    });

    it("includes key primitive types", () => {
      const index = generateDatatypeIndex(loader, scope);
      const primitiveSection = index.split("## Primitive Types")[1];
      expect(primitiveSection).toContain("string");
      expect(primitiveSection).toContain("boolean");
      expect(primitiveSection).toContain("dateTime");
    });

    it("types are sorted alphabetically", () => {
      const index = generateDatatypeIndex(loader, scope);
      const complexSection = index.split("## Complex Types")[1]?.split("##")[0];
      const lines = complexSection!
        .split("\n")
        .filter((l) => l.includes(" : "))
        .map((l) => l.split(" : ")[0].trim());
      const sorted = [...lines].sort((a, b) => a.localeCompare(b));
      expect(lines).toEqual(sorted);
    });
  });
});
