import { describe, it, expect, beforeAll } from "vitest";
import {
  initLoader,
  getEZF,
  lookupElement,
  createServer,
  getResourceIndex,
  getDatatypeIndex,
  getDatatypeEZF,
  getExamples,
  getSearchParams,
  getBindings,
  getReferences,
  getConstraints,
  listIGs,
  getLoader,
  getElementDocumentation,
} from "../src/server.js";
import { searchSpec } from "../src/pipeline/searchIndex.js";
import { compareProfiles } from "../src/pipeline/sdDiff.js";

describe("MCP Server", () => {
  beforeAll(async () => {
    await initLoader();
  }, 120000);

  describe("getEZF", () => {
    it("returns EZF text for Patient", () => {
      const ezf = getEZF("Patient");
      expect(ezf).toContain("@format ezf/0.1");
      expect(ezf).toContain("@resource Patient");
      expect(ezf).toContain("@elements");
      expect(ezf).toContain("gender");
    });

    it("includes search params in output", () => {
      const ezf = getEZF("Patient");
      expect(ezf).toContain("@search");
    });

    it("includes operations in output", () => {
      const ezf = getEZF("Patient");
      expect(ezf).toContain("@operations");
      expect(ezf).toContain("$match");
    });

    it("caches results on second call", () => {
      const first = getEZF("Patient");
      const second = getEZF("Patient");
      expect(first).toBe(second);
    });

    it("throws for unknown resource", () => {
      expect(() => getEZF("NotARealResource")).toThrow("not found");
    });
  });

  describe("getResourceIndex", () => {
    it("returns categorized resource index", () => {
      const index = getResourceIndex();
      expect(index).toContain("# FHIR Resource Index");
      expect(index).toContain("## Administration");
      expect(index).toContain("Patient");
    });

    it("caches on second call", () => {
      const first = getResourceIndex();
      const second = getResourceIndex();
      expect(first).toBe(second);
    });
  });

  describe("getDatatypeIndex", () => {
    it("returns datatype index with complex and primitive types", () => {
      const index = getDatatypeIndex();
      expect(index).toContain("## Complex Types");
      expect(index).toContain("## Primitive Types");
      expect(index).toContain("Identifier");
      expect(index).toContain("string");
    });
  });

  describe("getDatatypeEZF", () => {
    it("returns EZF for a complex datatype", () => {
      const ezf = getDatatypeEZF("HumanName");
      expect(ezf).toContain("@datatype HumanName");
      expect(ezf).toContain("@elements");
    });

    it("returns EZF for a primitive datatype", () => {
      const ezf = getDatatypeEZF("string");
      expect(ezf).toContain("@datatype string");
    });

    it("throws for unknown datatype", () => {
      expect(() => getDatatypeEZF("NotAType")).toThrow("not found");
    });

    it("caches results", () => {
      const first = getDatatypeEZF("Identifier");
      const second = getDatatypeEZF("Identifier");
      expect(first).toBe(second);
    });
  });

  describe("lookupElement", () => {
    it("finds top-level element", () => {
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("Patient.gender");
      expect(result).toContain("Cardinality: 0..1");
      expect(result).toContain("Type: code");
      expect(result).toContain("Binding: required");
    });

    it("finds nested element via dot path", () => {
      const result = lookupElement("Patient", "contact.name");
      expect(result).toContain("Patient.contact.name");
      expect(result).toContain("Type: HumanName");
    });

    it("resolves choice types (value[x])", () => {
      const result = lookupElement("Observation", "value[x]");
      expect(result).toContain("Observation.value[x]");
      expect(result).toContain("Quantity");
      expect(result).toContain("CodeableConcept");
      expect(result).toContain("string");
    });

    it("returns available elements when path not found", () => {
      const result = lookupElement("Patient", "nonexistent");
      expect(result).toContain("not found");
      expect(result).toContain("Available:");
      expect(result).toContain("gender");
    });

    it("returns clear error for invalid paths", () => {
      const result = lookupElement("Patient", "gender.nonexistent");
      expect(result).toContain("has no children");
    });

    it("handles element with reference types", () => {
      const result = lookupElement("Patient", "generalPractitioner");
      expect(result).toContain("Reference");
      expect(result).toContain("Organization");
    });

    it("shows flags", () => {
      const result = lookupElement("Patient", "active");
      expect(result).toContain("?!");
      expect(result).toContain("Σ");
    });

    it("shows children list for backbone elements", () => {
      const result = lookupElement("Patient", "contact");
      expect(result).toContain("Children:");
    });

    // Additional golden I/O tests per TESTING-STRATEGY.md §4.2
    it("finds nested element with CodeableConcept type", () => {
      const result = lookupElement("Patient", "contact.relationship");
      expect(result).toContain("Patient.contact.relationship");
      expect(result).toContain("Type: CodeableConcept");
      expect(result).toContain("Cardinality: 0..*");
    });

    it("resolves deep path through multiple backbone levels", () => {
      const result = lookupElement("Claim", "item.detail.subDetail.factor");
      expect(result).toContain("Claim.item.detail.subDetail.factor");
      expect(result).toContain("Type: decimal");
    });

    it("uses Short label instead of Description", () => {
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("Short:");
      expect(result).not.toContain("Description:");
    });

    it("includes Definition field from raw StructureDefinition", () => {
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("Definition:");
      // Patient.gender has a definition in the FHIR spec
      expect(result).toMatch(/Definition: .+/);
    });

    it("includes Comment field when present", () => {
      // Patient.gender has a comment about sex vs gender
      const result = lookupElement("Patient", "gender");
      expect(result).toContain("Comment:");
    });

    it("includes When Missing field when present", () => {
      // Patient.active has meaningWhenMissing
      const result = lookupElement("Patient", "active");
      expect(result).toContain("When Missing:");
    });

    it("includes Requirements field when present", () => {
      // Patient.contact.organization has requirements
      const result = lookupElement("Patient", "contact.organization");
      expect(result).toContain("Requirements:");
    });
  });

  describe("getExamples", () => {
    it("returns array for any resource type", () => {
      const examples = getExamples("Patient");
      expect(Array.isArray(examples)).toBe(true);
    });

    it("returns CapabilityStatement examples (present in core package)", () => {
      const examples = getExamples("CapabilityStatement");
      expect(examples.length).toBeGreaterThan(0);
      expect(examples[0].resourceType).toBe("CapabilityStatement");
    });

    it("respects count parameter", () => {
      const examples = getExamples("CapabilityStatement", 2);
      expect(examples.length).toBeLessThanOrEqual(2);
    });

    it("returns empty array for resource with no instances in core", () => {
      // Core package doesn't contain Patient example instances
      const examples = getExamples("Patient");
      expect(examples).toEqual([]);
    });
  });

  describe("getSearchParams", () => {
    it("returns search params for Patient", () => {
      const params = getSearchParams("Patient");
      expect(params.length).toBeGreaterThan(5);
    });

    it("includes name, type, and expression", () => {
      const params = getSearchParams("Patient");
      const genderParam = params.find((p) => p.name === "gender");
      expect(genderParam).toBeDefined();
      expect(genderParam!.type).toBe("token");
      expect(genderParam!.expression).toBeTruthy();
    });

    it("returns params for Observation", () => {
      const params = getSearchParams("Observation");
      expect(params.length).toBeGreaterThan(5);
    });

    it("returns empty array for unknown resource", () => {
      const params = getSearchParams("NotAResource");
      expect(params).toEqual([]);
    });
  });

  describe("search_spec (via searchSpec)", () => {
    it("finds Patient via search index", () => {
      const results = searchSpec("Patient");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("Patient");
    });

    // Additional golden I/O tests per TESTING-STRATEGY.md §4.2
    it("finds relevant results for element concept search", () => {
      const results = searchSpec("blood pressure");
      expect(results.length).toBeGreaterThan(0);
      // Observation-related results should rank highly for blood pressure searches
      const observationResult = results.find((r) => r.name.includes("Observation"));
      expect(observationResult).toBeDefined();
    });

    it("ranks AllergyIntolerance high for allergy search", () => {
      const results = searchSpec("allergies");
      expect(results.length).toBeGreaterThan(0);
      const allergyResult = results.find((r) => r.name === "AllergyIntolerance");
      expect(allergyResult).toBeDefined();
      // Should be in top 5 results
      const topFive = results.slice(0, 5);
      expect(topFive.some((r) => r.name === "AllergyIntolerance")).toBe(true);
    });

    it("returns empty results for nonsense query", () => {
      const results = searchSpec("xyzzy");
      expect(results).toEqual([]);
    });
  });

  describe("listIGs", () => {
    it("lists the default R5 core package", () => {
      const packages = listIGs();
      expect(packages.length).toBeGreaterThan(0);
      expect(packages[0].name).toBe("hl7.fhir.r5.core");
      expect(packages[0].version).toBe("5.0.0");
      expect(packages[0].artifactCount).toBeGreaterThan(100);
    });
  });

  describe("getBindings", () => {
    it("returns bindings for Patient", () => {
      const bindings = getBindings("Patient");
      expect(bindings.length).toBeGreaterThan(0);
      const genderBinding = bindings.find((b) => b.path.includes("gender"));
      expect(genderBinding).toBeDefined();
      expect(genderBinding!.strength).toBe("required");
    });

    it("includes valueSet URIs", () => {
      const bindings = getBindings("Patient");
      const withVS = bindings.filter((b) => b.valueSet);
      expect(withVS.length).toBeGreaterThan(0);
    });

    it("throws for unknown resource", () => {
      expect(() => getBindings("NotAResource")).toThrow("not found");
    });

    // Additional golden I/O test per TESTING-STRATEGY.md §4.2
    it("includes gender → administrative-gender (required)", () => {
      const bindings = getBindings("Patient");
      const genderBinding = bindings.find((b) => b.path === "Patient.gender");
      expect(genderBinding).toBeDefined();
      expect(genderBinding!.strength).toBe("required");
      expect(genderBinding!.valueSet).toContain("administrative-gender");
    });
  });

  describe("getReferences", () => {
    it("returns references for Patient", () => {
      const refs = getReferences("Patient");
      expect(refs.length).toBeGreaterThan(0);
      const gpRef = refs.find((r) => r.path.includes("generalPractitioner"));
      expect(gpRef).toBeDefined();
      expect(gpRef!.targets.length).toBeGreaterThan(0);
    });

    it("throws for unknown resource", () => {
      expect(() => getReferences("NotAResource")).toThrow("not found");
    });

    // Additional golden I/O test per TESTING-STRATEGY.md §4.2
    it("includes generalPractitioner → Organization|Practitioner|PractitionerRole", () => {
      const refs = getReferences("Patient");
      const gpRef = refs.find((r) => r.path === "Patient.generalPractitioner");
      expect(gpRef).toBeDefined();
      expect(gpRef!.targets.length).toBeGreaterThan(0);
      // Should include Organization, Practitioner, and PractitionerRole
      expect(gpRef!.targets.some((t) => t.includes("Organization"))).toBe(true);
      expect(gpRef!.targets.some((t) => t.includes("Practitioner"))).toBe(true);
      expect(gpRef!.targets.some((t) => t.includes("PractitionerRole"))).toBe(true);
    });
  });

  describe("getConstraints", () => {
    it("returns constraints for Patient", () => {
      const constraints = getConstraints("Patient");
      expect(constraints.length).toBeGreaterThan(0);
    });

    it("includes key, severity, and human description", () => {
      const constraints = getConstraints("Patient");
      const first = constraints[0];
      expect(first.key).toBeTruthy();
      expect(first.severity).toBeTruthy();
      expect(first.human).toBeTruthy();
    });

    it("returns empty array for unknown resource", () => {
      const constraints = getConstraints("NotAResource");
      expect(constraints).toEqual([]);
    });

    // Additional golden I/O test per TESTING-STRATEGY.md §4.2
    it("includes pat-1 constraint with human description", () => {
      const constraints = getConstraints("Patient");
      const pat1 = constraints.find((c) => c.key === "pat-1");
      expect(pat1).toBeDefined();
      expect(pat1!.severity).toBeTruthy();
      expect(pat1!.human).toBeTruthy();
      expect(pat1!.human.length).toBeGreaterThan(0);
    });
  });

  describe("compare_profiles", () => {
    it("returns no differences when comparing identical resources", () => {
      const loader = getLoader();
      if (!loader) throw new Error("Loader not initialized");

      const result = compareProfiles(loader, "Patient", "Patient");
      expect(result).toBeDefined();
      expect(result!.changes.length).toBe(0);
    });

    it("detects differences between resources", () => {
      const loader = getLoader();
      if (!loader) throw new Error("Loader not initialized");

      // Compare different resources to verify diff detection
      // This is a sanity test; Patient and Observation should have differences
      const result = compareProfiles(loader, "Patient", "Observation");
      expect(result).toBeDefined();
      // Different resources will have many differences
      expect(result!.changes.length).toBeGreaterThan(0);
    });
  });

  describe("createServer", () => {
    it("creates an MCP server instance", () => {
      const server = createServer();
      expect(server).toBeDefined();
    });
  });
});
