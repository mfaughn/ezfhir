import { describe, it, expect } from "vitest";
import { extractExtension } from "../../src/pipeline/extensionExtractor.js";

describe("Extension Definition Extractor", () => {
  describe("simple extension", () => {
    const simpleSD = {
      resourceType: "StructureDefinition",
      name: "patient-birthPlace",
      url: "http://hl7.org/fhir/StructureDefinition/patient-birthPlace",
      type: "Extension",
      derivation: "constraint",
      description: "The registered place of birth of the patient.",
      context: [
        { type: "element", expression: "Patient" },
      ],
      snapshot: {
        element: [
          { path: "Extension", min: 0, max: "1" },
          { path: "Extension.url", min: 1, max: "1" },
          {
            path: "Extension.value[x]",
            min: 1,
            max: "1",
            type: [{ code: "Address" }],
          },
        ],
      },
    };

    it("extracts simple extension correctly", () => {
      const ext = extractExtension(simpleSD as any);
      expect(ext).toBeDefined();
      expect(ext!.name).toBe("patient-birthPlace");
      expect(ext!.kind).toBe("simple");
      expect(ext!.valueTypes).toEqual(["Address"]);
      expect(ext!.min).toBe(0);
      expect(ext!.max).toBe("1");
      expect(ext!.description).toContain("birth");
    });

    it("extracts context", () => {
      const ext = extractExtension(simpleSD as any);
      expect(ext!.context).toEqual(["Patient"]);
    });
  });

  describe("complex extension", () => {
    const complexSD = {
      resourceType: "StructureDefinition",
      name: "us-core-race",
      url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
      type: "Extension",
      derivation: "constraint",
      description: "Concepts classifying the person into a named category of humans.",
      context: [
        { type: "element", expression: "Patient" },
      ],
      snapshot: {
        element: [
          { path: "Extension", min: 0, max: "1" },
          { path: "Extension.extension", min: 1, max: "*" },
          {
            path: "Extension.extension.url",
            min: 1,
            max: "1",
          },
          {
            path: "Extension.extension.value[x]",
            min: 1,
            max: "1",
            type: [{ code: "Coding" }],
          },
          { path: "Extension.url", min: 1, max: "1" },
        ],
      },
    };

    it("detects complex extension", () => {
      const ext = extractExtension(complexSD as any);
      expect(ext).toBeDefined();
      expect(ext!.name).toBe("us-core-race");
      expect(ext!.kind).toBe("complex");
    });
  });

  describe("multi-type extension", () => {
    const multiSD = {
      resourceType: "StructureDefinition",
      name: "patient-disability",
      url: "http://hl7.org/fhir/StructureDefinition/patient-disability",
      type: "Extension",
      derivation: "constraint",
      description: "A disability of the patient.",
      snapshot: {
        element: [
          { path: "Extension", min: 0, max: "*" },
          { path: "Extension.url", min: 1, max: "1" },
          {
            path: "Extension.value[x]",
            min: 1,
            max: "1",
            type: [
              { code: "CodeableConcept" },
            ],
          },
        ],
      },
    };

    it("handles extension with multiple cardinality", () => {
      const ext = extractExtension(multiSD as any);
      expect(ext).toBeDefined();
      expect(ext!.max).toBe("*");
      expect(ext!.kind).toBe("simple");
      expect(ext!.valueTypes).toEqual(["CodeableConcept"]);
    });
  });

  describe("edge cases", () => {
    it("returns undefined for non-extension SD", () => {
      const sd = {
        resourceType: "StructureDefinition",
        name: "Patient",
        type: "Patient",
        snapshot: { element: [] },
      };
      expect(extractExtension(sd as any)).toBeUndefined();
    });

    it("returns undefined for SD without snapshot", () => {
      const sd = {
        resourceType: "StructureDefinition",
        name: "SomeExt",
        type: "Extension",
      };
      expect(extractExtension(sd as any)).toBeUndefined();
    });

    it("truncates long descriptions", () => {
      const sd = {
        resourceType: "StructureDefinition",
        name: "long-desc",
        type: "Extension",
        description: "A".repeat(200),
        snapshot: {
          element: [
            { path: "Extension", min: 0, max: "1" },
            { path: "Extension.url", min: 1, max: "1" },
            { path: "Extension.value[x]", min: 1, max: "1", type: [{ code: "string" }] },
          ],
        },
      };
      const ext = extractExtension(sd as any);
      expect(ext!.description!.length).toBeLessThanOrEqual(80);
    });
  });
});
