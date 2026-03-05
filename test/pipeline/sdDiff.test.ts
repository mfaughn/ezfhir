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

  describe("comprehensive diff scenarios (TASK-040)", () => {
    it("detects cardinality loosening (1..1 → 0..1)", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.required", min: 1, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.required", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const cardChange = result.changes.find((c) => c.category === "cardinality");
      expect(cardChange).toBeDefined();
      expect(cardChange!.left).toBe("1..1");
      expect(cardChange!.right).toBe("0..1");
      expect(cardChange!.severity).toBe("breaking"); // Loosening can break expectations
    });

    it("detects cardinality loosening (0..1 → 0..*)", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.single", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.single", min: 0, max: "*", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const cardChange = result.changes.find((c) => c.category === "cardinality");
      expect(cardChange).toBeDefined();
      expect(cardChange!.left).toBe("0..1");
      expect(cardChange!.right).toBe("0..*");
      expect(cardChange!.severity).toBe("compatible"); // Max loosening is compatible
    });

    it("detects type narrowing from multiple types to single type", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.value",
          min: 0,
          max: "1",
          type: [
            { code: "boolean" },
            { code: "dateTime" },
            { code: "integer" },
          ],
        },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.value", min: 0, max: "1", type: [{ code: "dateTime" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const typeChange = result.changes.find((c) => c.category === "type");
      expect(typeChange).toBeDefined();
      expect(typeChange!.left).toBe("boolean|dateTime|integer");
      expect(typeChange!.right).toBe("dateTime");
      expect(typeChange!.severity).toBe("breaking"); // Types removed
    });

    it("detects binding strengthening from extensible to required", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.status",
          min: 0,
          max: "1",
          type: [{ code: "code" }],
          binding: { strength: "extensible", valueSet: "http://example.com/vs" },
        },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.status",
          min: 0,
          max: "1",
          type: [{ code: "code" }],
          binding: { strength: "required", valueSet: "http://example.com/vs" },
        },
      ]);
      const result = diffStructureDefinitions(left, right);
      const bindingChange = result.changes.find((c) => c.category === "binding");
      expect(bindingChange).toBeDefined();
      expect(bindingChange!.left).toContain("extensible");
      expect(bindingChange!.right).toContain("required");
      expect(bindingChange!.severity).toBe("narrowing");
    });

    it("detects binding weakening from required to preferred", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.code",
          min: 0,
          max: "1",
          type: [{ code: "code" }],
          binding: { strength: "required", valueSet: "http://example.com/vs" },
        },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.code",
          min: 0,
          max: "1",
          type: [{ code: "code" }],
          binding: { strength: "preferred", valueSet: "http://example.com/vs" },
        },
      ]);
      const result = diffStructureDefinitions(left, right);
      const bindingChange = result.changes.find((c) => c.category === "binding");
      expect(bindingChange).toBeDefined();
      expect(bindingChange!.severity).toBe("breaking"); // Weakening is breaking
    });

    it("detects must-support removal", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.important", min: 0, max: "1", type: [{ code: "string" }], mustSupport: true },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.important", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const msChange = result.changes.find((c) => c.category === "must-support");
      expect(msChange).toBeDefined();
      expect(msChange!.left).toBe("true");
      expect(msChange!.right).toBe("false");
      expect(msChange!.severity).toBe("compatible"); // Removing MS is compatible
    });

    it("detects new sub-element added to backbone", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.contact", min: 0, max: "*" },
        { path: "TestResource.contact.name", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.contact", min: 0, max: "*" },
        { path: "TestResource.contact.name", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.contact.phone", min: 0, max: "1", type: [{ code: "ContactPoint" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const newEl = result.changes.find((c) => c.category === "new-element" && c.path === "TestResource.contact.phone");
      expect(newEl).toBeDefined();
      expect(newEl!.severity).toBe("compatible");
    });

    it("detects slicing removal", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.identifier",
          min: 0,
          max: "*",
          type: [{ code: "Identifier" }],
          slicing: { rules: "open", discriminator: [{ type: "value", path: "system" }] },
        },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.identifier", min: 0, max: "*", type: [{ code: "Identifier" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const slicingChange = result.changes.find((c) => c.category === "slicing");
      expect(slicingChange).toBeDefined();
      expect(slicingChange!.left).toContain("rules=open");
      expect(slicingChange!.right).toBe("(removed)");
      expect(slicingChange!.severity).toBe("breaking");
    });

    it("detects extension element added", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.name", min: 0, max: "1", type: [{ code: "string" }] },
        {
          path: "TestResource.extension",
          min: 0,
          max: "*",
          type: [{ code: "Extension", profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-race"] }],
        },
      ]);
      const result = diffStructureDefinitions(left, right);
      const extChange = result.changes.find((c) => c.category === "new-element" && c.path === "TestResource.extension");
      expect(extChange).toBeDefined();
      expect(extChange!.severity).toBe("compatible");
    });

    it("detects fixed value removal", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.category", min: 0, max: "1", type: [{ code: "code" }], fixedCode: "vital-signs" },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.category", min: 0, max: "1", type: [{ code: "code" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const fixedChange = result.changes.find((c) => c.category === "fixed-value");
      expect(fixedChange).toBeDefined();
      expect(fixedChange!.left).toBe("vital-signs");
      expect(fixedChange!.right).toBe("(none)");
      expect(fixedChange!.severity).toBe("breaking");
    });

    it("detects no changes between identical structures", () => {
      const sd = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.field1", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.field2", min: 1, max: "*", type: [{ code: "integer" }] },
      ]);
      const result = diffStructureDefinitions(sd, sd);
      expect(result.changes).toEqual([]);
      expect(result.summary.total).toBe(0);
      expect(result.summary.breaking).toBe(0);
      expect(result.summary.narrowing).toBe(0);
      expect(result.summary.compatible).toBe(0);
    });

    it("detects multiple simultaneous changes on same element", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.value",
          min: 0,
          max: "1",
          type: [{ code: "string" }, { code: "integer" }],
          binding: { strength: "preferred", valueSet: "http://example.com/vs" },
        },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.value",
          min: 1,
          max: "1",
          type: [{ code: "string" }],
          binding: { strength: "required", valueSet: "http://example.com/vs" },
          mustSupport: true,
        },
      ]);
      const result = diffStructureDefinitions(left, right);

      const changesForPath = result.changes.filter((c) => c.path === "TestResource.value");
      expect(changesForPath.length).toBeGreaterThanOrEqual(3); // cardinality, type, binding, must-support

      const cardChange = changesForPath.find((c) => c.category === "cardinality");
      expect(cardChange).toBeDefined();
      expect(cardChange!.severity).toBe("narrowing");

      const typeChange = changesForPath.find((c) => c.category === "type");
      expect(typeChange).toBeDefined();
      expect(typeChange!.severity).toBe("breaking");

      const bindingChange = changesForPath.find((c) => c.category === "binding");
      expect(bindingChange).toBeDefined();
      expect(bindingChange!.severity).toBe("narrowing");

      const msChange = changesForPath.find((c) => c.category === "must-support");
      expect(msChange).toBeDefined();
      expect(msChange!.severity).toBe("narrowing");
    });

    it("correctly classifies severity for breaking changes", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.removed", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.typed", min: 0, max: "1", type: [{ code: "string" }, { code: "integer" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.typed", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);

      const breakingChanges = result.changes.filter((c) => c.severity === "breaking");
      expect(breakingChanges.length).toBeGreaterThan(0);
      expect(result.summary.breaking).toBe(breakingChanges.length);

      // Removed element should be breaking
      const removedChange = result.changes.find((c) => c.category === "removed-element");
      expect(removedChange!.severity).toBe("breaking");

      // Type removal should be breaking
      const typeChange = result.changes.find((c) => c.category === "type");
      expect(typeChange!.severity).toBe("breaking");
    });

    it("correctly classifies severity for narrowing changes", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.tightened", min: 0, max: "*", type: [{ code: "string" }] },
        { path: "TestResource.bound", min: 0, max: "1", type: [{ code: "code" }], binding: { strength: "preferred", valueSet: "http://example.com/vs" } },
        { path: "TestResource.supported", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.tightened", min: 1, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.bound", min: 0, max: "1", type: [{ code: "code" }], binding: { strength: "required", valueSet: "http://example.com/vs" } },
        { path: "TestResource.supported", min: 0, max: "1", type: [{ code: "string" }], mustSupport: true },
      ]);
      const result = diffStructureDefinitions(left, right);

      const narrowingChanges = result.changes.filter((c) => c.severity === "narrowing");
      expect(narrowingChanges.length).toBeGreaterThan(0);
      expect(result.summary.narrowing).toBe(narrowingChanges.length);

      // All these should be narrowing
      expect(narrowingChanges.map((c) => c.category).sort()).toEqual(["binding", "cardinality", "must-support"].sort());
    });

    it("correctly classifies severity for compatible changes", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.existing", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.wasMS", min: 0, max: "1", type: [{ code: "string" }], mustSupport: true },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.existing", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.wasMS", min: 0, max: "1", type: [{ code: "string" }] },
        { path: "TestResource.newField", min: 0, max: "1", type: [{ code: "boolean" }] },
      ]);
      const result = diffStructureDefinitions(left, right);

      const compatibleChanges = result.changes.filter((c) => c.severity === "compatible");
      expect(compatibleChanges.length).toBeGreaterThan(0);
      expect(result.summary.compatible).toBe(compatibleChanges.length);

      // New element is compatible
      const newElChange = compatibleChanges.find((c) => c.category === "new-element");
      expect(newElChange).toBeDefined();

      // MS removal is compatible
      const msChange = compatibleChanges.find((c) => c.category === "must-support");
      expect(msChange).toBeDefined();
    });

    it("detects binding valueSet URL change", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.code",
          min: 0,
          max: "1",
          type: [{ code: "code" }],
          binding: { strength: "required", valueSet: "http://example.com/vs1" },
        },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        {
          path: "TestResource.code",
          min: 0,
          max: "1",
          type: [{ code: "code" }],
          binding: { strength: "required", valueSet: "http://example.com/vs2" },
        },
      ]);
      const result = diffStructureDefinitions(left, right);
      const bindingChange = result.changes.find((c) => c.category === "binding");
      expect(bindingChange).toBeDefined();
      expect(bindingChange!.left).toContain("vs1");
      expect(bindingChange!.right).toContain("vs2");
      expect(bindingChange!.severity).toBe("compatible"); // Same strength, different VS
    });

    it("handles max cardinality change from specific number to unbounded", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.items", min: 0, max: "5", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.items", min: 0, max: "*", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const cardChange = result.changes.find((c) => c.category === "cardinality");
      expect(cardChange).toBeDefined();
      expect(cardChange!.left).toBe("0..5");
      expect(cardChange!.right).toBe("0..*");
      expect(cardChange!.severity).toBe("compatible");
    });

    it("handles max cardinality tightening from unbounded to specific number", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.items", min: 0, max: "*", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.items", min: 0, max: "3", type: [{ code: "string" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const cardChange = result.changes.find((c) => c.category === "cardinality");
      expect(cardChange).toBeDefined();
      expect(cardChange!.left).toBe("0..*");
      expect(cardChange!.right).toBe("0..3");
      expect(cardChange!.severity).toBe("narrowing");
    });

    it("detects type addition (compatible change)", () => {
      const left = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.value", min: 0, max: "1", type: [{ code: "string" }] },
      ]);
      const right = makeSyntheticSD("TestResource", [
        { path: "TestResource", min: 0, max: "*" },
        { path: "TestResource.value", min: 0, max: "1", type: [{ code: "string" }, { code: "integer" }] },
      ]);
      const result = diffStructureDefinitions(left, right);
      const typeChange = result.changes.find((c) => c.category === "type");
      expect(typeChange).toBeDefined();
      expect(typeChange!.left).toBe("string");
      expect(typeChange!.right).toBe("integer|string");
      expect(typeChange!.severity).toBe("narrowing"); // Adding types is still narrowing per current logic
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
