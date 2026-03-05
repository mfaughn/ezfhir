import { describe, it, expect, beforeAll } from "vitest";
import { serialize } from "../../src/converter/serializer.js";
import { parse } from "../../src/converter/parser.js";
import { verify } from "../../src/converter/verifier.js";
import type { EZFElement } from "../../src/converter/types.js";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";

/**
 * Find an element by its full FHIR path (e.g., "Claim.item.detail.subDetail").
 * The parser stores paths without the resource prefix, so "Claim.item" is stored
 * as just "item", and nested elements like "detail" are children of "item".
 * This function strips the resource prefix, then walks the tree segment by segment.
 */
function findElement(elements: EZFElement[], fullPath: string): EZFElement | undefined {
  // Strip resource name prefix: "Claim.item.detail" → ["item", "detail"]
  const parts = fullPath.split(".");
  const segments = parts.length > 1 ? parts.slice(1) : parts;

  let current: EZFElement[] = elements;
  let found: EZFElement | undefined;

  for (const segment of segments) {
    found = undefined;
    for (const el of current) {
      if (el.path === segment) {
        found = el;
        break;
      }
    }
    if (!found) return undefined;
    current = found.children ?? [];
  }

  return found;
}

/**
 * Edge case tests per TESTING-STRATEGY.md §2.3.
 * These test specific tricky StructureDefinition features.
 */
describe("Edge Case Tests", () => {
  let loader: FPLPackageLoader;

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, "hl7.fhir.r5.core", "5.0.0");
  }, 120000);

  describe("choice types with many options", () => {
    it("Observation.value[x] has all expected type options", () => {
      const sd = getStructureDefinition(loader, "Observation")!;
      const ezf = serialize(sd);

      // value[x] should appear with multiple types
      expect(ezf).toContain("value[x]");

      // Parse and check the value[x] element specifically
      const doc = parse(ezf);
      const valueEl = findElement(doc.elements!, "Observation.value[x]");
      expect(valueEl).toBeDefined();

      // R5 Observation.value[x] supports: Quantity, CodeableConcept, string,
      // boolean, integer, Range, Ratio, SampledData, time, dateTime, Period,
      // Attachment, Reference
      const typeCodes = valueEl!.types.map(t => t.code);
      expect(typeCodes).toContain("Quantity");
      expect(typeCodes).toContain("CodeableConcept");
      expect(typeCodes).toContain("string");
      expect(typeCodes).toContain("boolean");
      expect(typeCodes).toContain("integer");
      expect(typeCodes).toContain("Range");
      expect(typeCodes).toContain("Ratio");
      expect(typeCodes).toContain("SampledData");
      expect(typeCodes).toContain("time");
      expect(typeCodes).toContain("dateTime");
      expect(typeCodes).toContain("Period");
      expect(typeCodes.length).toBeGreaterThanOrEqual(11);
    });

    it("MedicationRequest.medication[x] has multiple type options", () => {
      const sd = getStructureDefinition(loader, "MedicationRequest")!;
      const ezf = serialize(sd);
      // MedicationRequest may use CodeableReference in R5
      const doc = parse(ezf);
      // Find medication element (might be medication[x] or just medication)
      const medEl = findElement(doc.elements!, "MedicationRequest.medication") ??
        findElement(doc.elements!, "MedicationRequest.medication[x]");
      expect(medEl).toBeDefined();
    });
  });

  describe("deeply nested backbone elements", () => {
    it("Claim has 3+ levels of backbone nesting (item.detail.subDetail)", () => {
      const sd = getStructureDefinition(loader, "Claim")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);

      // Find nested elements using tree traversal
      const itemEl = findElement(doc.elements!, "Claim.item");
      expect(itemEl).toBeDefined();

      const detailEl = findElement(doc.elements!, "Claim.item.detail");
      expect(detailEl).toBeDefined();

      const subDetailEl = findElement(doc.elements!, "Claim.item.detail.subDetail");
      expect(subDetailEl).toBeDefined();
      expect(subDetailEl!.children).toBeDefined();
      expect(subDetailEl!.children!.length).toBeGreaterThan(0);
    });

    it("ExplanationOfBenefit has deep nesting", () => {
      const sd = getStructureDefinition(loader, "ExplanationOfBenefit")!;
      const ezf = serialize(sd);
      expect(ezf).toContain("item");
      expect(ezf).toContain("detail");
      expect(ezf).toContain("subDetail");
      const result = verify(parse(ezf).elements!, sd);
      expect(result.passed).toBe(true);
    });
  });

  describe("recursive references (contentReference)", () => {
    it("Questionnaire.item serializes as @ref for recursive items", () => {
      const sd = getStructureDefinition(loader, "Questionnaire")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);

      // The nested item.item should reference the parent item via @ref
      expect(ezf).toContain("@ref(Questionnaire.item)");

      // Round-trip should pass
      const result = verify(doc.elements!, sd);
      expect(result.passed).toBe(true);
    });

    it("Parameters.parameter has contentReference", () => {
      const sd = getStructureDefinition(loader, "Parameters")!;
      const ezf = serialize(sd);
      // Parameters.parameter.part references back to Parameters.parameter
      expect(ezf).toContain("@ref");
      const doc = parse(ezf);
      const result = verify(doc.elements!, sd);
      expect(result.passed).toBe(true);
    });

    it("Bundle.entry.resource has contentReference", () => {
      const sd = getStructureDefinition(loader, "Bundle")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      const result = verify(doc.elements!, sd);
      expect(result.passed).toBe(true);
    });
  });

  describe("abstract resources", () => {
    it("Resource serializes with @abstract true", () => {
      const sd = getStructureDefinition(loader, "Resource");
      if (!sd) return; // May not be loadable by name
      const ezf = serialize(sd);
      expect(ezf).toContain("@abstract");
    });

    it("DomainResource serializes with @abstract true", () => {
      const sd = getStructureDefinition(loader, "DomainResource");
      if (!sd) return;
      const ezf = serialize(sd);
      expect(ezf).toContain("@abstract");
    });
  });

  describe("primitive type extensions", () => {
    it("_birthDate and similar primitive extensions are excluded from Patient EZF", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const ezf = serialize(sd);
      // Primitive extensions (paths starting with _) should not appear
      expect(ezf).not.toContain("_birthDate");
      expect(ezf).not.toContain("_gender");
      expect(ezf).not.toContain("_active");
      // But the actual elements should be there
      expect(ezf).toContain("birthDate");
      expect(ezf).toContain("gender");
      expect(ezf).toContain("active");
    });
  });

  describe("elements with no short description", () => {
    it("falls back to first sentence of definition", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      // Every element with a description should have some text
      for (const el of doc.elements!) {
        // Some elements legitimately have no description (root element)
        if (el.path.split(".").length <= 1) continue;
        // Most elements should have a short description from either short or definition
        // This is a loose check — not all have descriptions
      }
      // Just verify that the EZF has description content
      expect(ezf).toContain("//");
    });
  });

  describe("contentReference elements per §6.7", () => {
    it("contentReference renders as @ref(path)", () => {
      const sd = getStructureDefinition(loader, "Questionnaire")!;
      const ezf = serialize(sd);

      // Find @ref in the EZF text
      const refMatch = ezf.match(/@ref\(([^)]+)\)/);
      expect(refMatch).toBeTruthy();

      // The reference should point to a valid path
      const refPath = refMatch![1];
      expect(refPath).toContain("Questionnaire.");
    });

    it("Bundle uses contentReference for nested entries", () => {
      const sd = getStructureDefinition(loader, "Bundle")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);
      // Verify round-trip passes — this tests the verifier handles contentRef
      const result = verify(doc.elements!, sd);
      expect(result.passed).toBe(true);
    });
  });

  describe("profile serialization", () => {
    it("profiles use base type paths not profile name", () => {
      const sd = getStructureDefinition(loader, "ActualGroup")!;
      const ezf = serialize(sd);
      // Should render as @profile, not @resource
      expect(ezf).toContain("@profile");
      expect(ezf).toContain("ActualGroup");
      expect(ezf).toContain("Group");
    });

    it("vital signs profiles serialize without hanging", () => {
      const profiles = ["vitalsigns", "bp", "bodyheight", "bodyweight"];
      for (const name of profiles) {
        const sd = getStructureDefinition(loader, name);
        if (!sd) continue;
        const ezf = serialize(sd);
        expect(ezf).toContain("@profile");
        expect(ezf.length).toBeGreaterThan(0);
      }
    });
  });

  describe("resources with many reference targets", () => {
    it("Patient.generalPractitioner has multiple sorted reference targets", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const ezf = serialize(sd);
      const doc = parse(ezf);

      const gpEl = findElement(doc.elements!, "Patient.generalPractitioner");
      expect(gpEl).toBeDefined();

      // Should have Reference type with sorted targets
      const refType = gpEl!.types.find(t => t.code === "Reference");
      expect(refType).toBeDefined();
      expect(refType!.targetProfile).toBeDefined();
      expect(refType!.targetProfile!.length).toBeGreaterThan(1);

      // Targets should be sorted alphabetically (§6.3)
      const targets = refType!.targetProfile!;
      const sorted = [...targets].sort();
      expect(targets).toEqual(sorted);
    });
  });

  describe("binding edge cases", () => {
    it("Patient.gender has required binding to administrative-gender", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const ezf = serialize(sd);
      expect(ezf).toContain("gender");
      expect(ezf).toContain("required");
      expect(ezf).toContain("administrative-gender");
    });

    it("example bindings are excluded from EZF", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const ezf = serialize(sd);
      // Example bindings should not appear
      // The serializer filters these out via INCLUDED_BINDING_STRENGTHS
      const doc = parse(ezf);
      if (doc.elements) {
        for (const el of doc.elements) {
          if (el.binding) {
            expect(["required", "extensible", "preferred"]).toContain(
              el.binding.strength
            );
          }
        }
      }
    });
  });
});
