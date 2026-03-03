import { describe, it, expect, beforeAll } from "vitest";
import {
  createPackageLoader,
  loadPackage,
  getStructureDefinition,
  type FPLPackageLoader,
} from "../../src/pipeline/packageLoader.js";
import {
  diffStructureDefinitions,
  renderDiff,
  compareProfiles,
} from "../../src/pipeline/sdDiff.js";

describe("SD Diff Engine", () => {
  let loader: FPLPackageLoader;
  const scope = "hl7.fhir.r5.core";

  beforeAll(async () => {
    loader = await createPackageLoader();
    await loadPackage(loader, scope, "5.0.0");
  }, 120000);

  describe("identical SDs", () => {
    it("produces no changes for same resource", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const result = diffStructureDefinitions(sd, sd);
      expect(result.changes).toEqual([]);
      expect(result.summary.total).toBe(0);
    });
  });

  describe("R5 core profile comparisons", () => {
    it("detects cardinality changes in ActualGroup vs Group", () => {
      const result = compareProfiles(loader, "Group", "ActualGroup", scope);
      expect(result).toBeDefined();
      const cardChanges = result!.changes.filter((c) => c.category === "cardinality");
      expect(cardChanges.length).toBeGreaterThan(0);
    });

    it("detects type narrowing in profiles", () => {
      const result = compareProfiles(loader, "Observation", "vitalsigns", scope);
      expect(result).toBeDefined();
      // vitalsigns has type narrowing and cardinality changes vs base Observation
      expect(result!.changes.length).toBeGreaterThan(0);
    });
  });

  describe("synthetic SD comparisons", () => {
    it("detects cardinality tightening", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.field", min: 0, max: "*", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.field", min: 1, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const cardChange = result.changes.find((c) => c.category === "cardinality");
      expect(cardChange).toBeDefined();
      expect(cardChange!.left).toBe("0..*");
      expect(cardChange!.right).toBe("1..1");
      expect(cardChange!.severity).toBe("narrowing");
    });

    it("detects type narrowing", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.value", min: 0, max: "1", type: [{ code: "string" }, { code: "integer" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.value", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const typeChange = result.changes.find((c) => c.category === "type");
      expect(typeChange).toBeDefined();
      expect(typeChange!.severity).toBe("breaking");
    });

    it("detects binding strength changes", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.code", min: 0, max: "1", type: [{ code: "code" }], binding: { strength: "preferred", valueSet: "http://example.com/vs" } },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.code", min: 0, max: "1", type: [{ code: "code" }], binding: { strength: "required", valueSet: "http://example.com/vs" } },
      ]);
      const result = diffStructureDefinitions(left, right);
      const bindingChange = result.changes.find((c) => c.category === "binding");
      expect(bindingChange).toBeDefined();
      expect(bindingChange!.severity).toBe("narrowing");
    });

    it("detects must-support addition", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }], mustSupport: true },
      ]);
      const result = diffStructureDefinitions(left, right);
      const msChange = result.changes.find((c) => c.category === "must-support");
      expect(msChange).toBeDefined();
      expect(msChange!.severity).toBe("narrowing");
    });

    it("detects new elements", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.newField", min: 0, max: "1", type: [{ code: "boolean" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const newEl = result.changes.find((c) => c.category === "new-element");
      expect(newEl).toBeDefined();
      expect(newEl!.path).toBe("TestResource.newField");
      expect(newEl!.severity).toBe("compatible");
    });

    it("detects removed elements", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.oldField", min: 0, max: "1", type: [{ code: "boolean" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const removed = result.changes.find((c) => c.category === "removed-element");
      expect(removed).toBeDefined();
      expect(removed!.path).toBe("TestResource.oldField");
      expect(removed!.severity).toBe("breaking");
    });

    it("detects fixed value addition", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.status", min: 0, max: "1", type: [{ code: "code" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.status", min: 0, max: "1", type: [{ code: "code" }], fixedCode: "active" },
      ]);
      const result = diffStructureDefinitions(left, right);
      const fixed = result.changes.find((c) => c.category === "fixed-value");
      expect(fixed).toBeDefined();
      expect(fixed!.right).toBe("active");
    });

    it("detects slicing addition", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.category", min: 0, max: "*", type: [{ code: "CodeableConcept" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.category", min: 0, max: "*", type: [{ code: "CodeableConcept" }], slicing: { rules: "open", discriminator: [{ type: "pattern", path: "$this" }] } },
      ]);
      const result = diffStructureDefinitions(left, right);
      const slicing = result.changes.find((c) => c.category === "slicing");
      expect(slicing).toBeDefined();
      expect(slicing!.severity).toBe("narrowing");
    });
  });

  describe("summary", () => {
    it("correctly counts severity categories", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.a", min: 0, max: "*", type: [{ code: "string" }] },
        { path: "TestResource.b", min: 0, max: "1", type: [{ code: "string" }, { code: "integer" }] },
        { path: "TestResource.c", min: 0, max: "1", type: [{ code: "code" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.a", min: 1, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.b", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.d", min: 0, max: "1", type: [{ code: "boolean" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      expect(result.summary.narrowing).toBeGreaterThan(0); // a: cardinality tightened
      expect(result.summary.breaking).toBeGreaterThan(0);  // b: type removed, c: removed
      expect(result.summary.compatible).toBeGreaterThan(0); // d: new element
    });
  });

  describe("renderDiff", () => {
    it("renders no differences message", () => {
      const sd = getStructureDefinition(loader, "Patient")!;
      const result = diffStructureDefinitions(sd, sd);
      const text = renderDiff(result);
      expect(text).toContain("No differences found");
    });

    it("renders changes with severity indicators", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.field", min: 0, max: "*", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.field", min: 1, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const text = renderDiff(result);
      expect(text).toContain("field");
      expect(text).toContain("cardinality");
    });
  });

  describe("compareProfiles", () => {
    it("returns undefined for nonexistent profile", () => {
      const result = compareProfiles(loader, "Patient", "NonExistent", scope);
      expect(result).toBeUndefined();
    });
  });
});

// Helper to create synthetic SDs for testing
function makeSyntheticSD(
  name: string,
  elements: Array<Record<string, unknown>>
): Record<string, unknown> {
  return {
    resourceType: "StructureDefinition",
    name,
    type: name,
    snapshot: { element: elements },
  };
}
